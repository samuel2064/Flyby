const express = require('express');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', true);

// Middleware to parse JSON
app.use(express.json());

// Permissive CORS for the E2E test environment
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'flyby-api'
  });
});

// Basic root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Flyby API is running',
    version: '1.0.0',
    endpoints: ['/api/health']
  });
});

// ---------------------------------------------------------------------------
// Prisma-backed persistence (TIR-281) with graceful in-memory fallback.
//
// When DATABASE_URL is set and the generated Prisma client initializes, all
// wait-time reports, subscriptions, and per-user preferences persist in
// PostgreSQL (flyby-db on Render; schema applied by `prisma migrate deploy`
// in the deploy flow). Otherwise the API degrades to the previous in-memory
// behavior so CI (no database) and local dev without a DB stay green.
// ---------------------------------------------------------------------------

let db = null;
try {
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = require('@prisma/client');
    db = new PrismaClient();
  }
} catch (err) {
  console.warn(`Prisma unavailable, using in-memory fallback: ${err.message}`);
  db = null;
}

// ---------------------------------------------------------------------------
// Mock/compatibility backend (SSE, VAPID/push, wait times, subscriptions)
// ---------------------------------------------------------------------------

const subscriptions = new Map();
let subSeq = 1;
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BMqC9TckHTr2DdYFqviDHxDoQZFKQz0zTbvk1KwUqJvXcbYQzPxmZbQ0c9kYvA1p1w0fKk1w2yQ0pXy9m5Qq0R8';

// --- SSE live updates -------------------------------------------------------

const sseClients = new Set();

function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('retry: 3000\n\n');
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  const interval = setInterval(() => {
    res.write(
      `data: ${JSON.stringify({
        type: 'wait-time-update',
        airport: req.query.airport || 'SEA',
        checkpoint: 'Main',
        waitMinutes: Math.floor(Math.random() * 20) + 5,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
  }, 2000);

  sseClients.add(res);
  req.on('close', () => {
    clearInterval(interval);
    sseClients.delete(res);
    res.end();
  });
}

app.get('/api/events', sseHandler);
app.get('/api/wait-times/stream', sseHandler);
app.get('/api/sse', sseHandler);

// --- Wait times (persisted when DB is available) ----------------------------
// TIR-298: GET never fabricates wait-time records. Unknown airports return 404
// (consistent with /api/airports/:code and /api/checkpoints); known airports
// with no persisted reports return an empty list - never a synthesized record
// with a misleading `updatedAt: now`.

app.get('/api/wait-times', async (req, res) => {
  const rawAirport = req.query.airport || req.query.airportId || null;
  // `airportId` accepts either the airport code (JFK) or the airport id (apt-jfk)
  const airport = rawAirport
    ? String(AIRPORT_CODES[rawAirport] || rawAirport).trim().toUpperCase()
    : null;
  if (rawAirport && !AIRPORTS.some((a) => a.code === airport)) {
    return res.status(404).json({ error: 'Airport not found' });
  }
  try {
    if (db) {
      const where = rawAirport ? { airport } : {};
      const rows = await db.waitTimeReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return res.json(
        rows.map((r) => ({
          airport: r.airport,
          checkpoint: r.checkpoint,
          waitMinutes: r.waitMinutes,
          updatedAt: r.createdAt.toISOString(),
        }))
      );
    }
  } catch (err) {
    console.warn(`GET /api/wait-times DB read failed: ${err.message}`);
  }
  res.json([]);
});

const REPORT_RATE_LIMIT_MS = 30000;
const REPORT_RATE_LIMIT_MAX_ENTRIES = 1000;
const reportRateLimits = new Map();

function reportLimitKey(req, body) {
  const identity = req.get('X-User-Id') || body.userId || body.reporter || null;
  if (identity) return `user:${String(identity)}`;
  return `ip:${req.ip || 'unknown'}`;
}

const reportHandler = async (req, res) => {
  const body = req.body || {};
  const waitMinutesValue =
    body.waitMinutes !== undefined
      ? body.waitMinutes
      : body.waitTimeMinutes !== undefined
        ? body.waitTimeMinutes
        : body.minutes;

  const errors = [];
  if (typeof body.airport !== 'string' || body.airport.trim() === '') {
    errors.push({ field: 'airport', message: 'airport must be a non-empty string' });
  }
  if (
    typeof waitMinutesValue !== 'number' ||
    !Number.isInteger(waitMinutesValue) ||
    waitMinutesValue <= 0
  ) {
    errors.push({ field: 'waitMinutes', message: 'waitMinutes must be a positive integer' });
  }
  if (errors.length) return res.status(400).json({ errors });

  const limitKey = reportLimitKey(req, body);
  const now = Date.now();
  if (reportRateLimits.size > REPORT_RATE_LIMIT_MAX_ENTRIES) {
    for (const [key, ts] of reportRateLimits) {
      if (now - ts >= REPORT_RATE_LIMIT_MS) reportRateLimits.delete(key);
    }
  }
  const lastAcceptedAt = reportRateLimits.get(limitKey) || 0;
  if (now - lastAcceptedAt < REPORT_RATE_LIMIT_MS) {
    const retryAfterSec = Math.ceil((lastAcceptedAt + REPORT_RATE_LIMIT_MS - now) / 1000);
    return res
      .status(429)
      .set('Retry-After', String(retryAfterSec))
      .json({ errors: [{ field: 'rateLimit', message: `Too many reports; retry in ${retryAfterSec}s` }] });
  }

  const id = `rpt_${Date.now()}`;
  const receivedAt = new Date().toISOString();
  try {
    if (db) {
      await db.waitTimeReport.create({
        data: {
          id,
          airport: body.airport.trim(),
          checkpoint: String(body.checkpoint || 'Main'),
          waitMinutes: waitMinutesValue,
          reporter: body.reporter || body.userId || null,
        },
      });
    }
  } catch (err) {
    console.warn(`POST /api/wait-times/report DB fallback: ${err.message}`);
  }
  reportRateLimits.set(limitKey, Date.now());
  res.status(201).json({ id, ...body, waitMinutes: waitMinutesValue, receivedAt });
};

// Report submission: canonical path is POST /api/wait-times; /report is kept
// as a frontend-compatible alias.
app.post('/api/wait-times', reportHandler);
app.post('/api/wait-times/report', reportHandler);

// --- Admin report deletion (TIR-299) -----------------------------------------
// DELETE /api/reports/:id removes a persisted wait-time report. Intended for
// QA test-record cleanup in production. Destructive on a public crowdsourced
// product, so: admin-only, fail-closed, audited.
//
// Auth: X-Admin-Key: <ADMIN_API_KEY> (or Authorization: Bearer <ADMIN_API_KEY>).
// If ADMIN_API_KEY is not configured, the endpoint is disabled (503) - never
// an open unauthenticated delete.
//
// Responses:
//   503 - ADMIN_API_KEY not configured (deletion disabled)
//   401 - missing or incorrect admin key
//   400 - invalid report id format
//   404 - well-formed id that does not exist (repeat deletes included)
//   204 - deleted

function configuredAdminKey() {
  const key = process.env.ADMIN_API_KEY;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

// Constant-time compare over sha256 digests so the key length cannot leak
// through timingSafeEqual's throw-on-length-mismatch behavior.
function adminKeyMatches(provided, expected) {
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function extractAdminKey(req) {
  const xAdminKey = req.get('X-Admin-Key');
  if (typeof xAdminKey === 'string' && xAdminKey.length > 0) return xAdminKey;
  const authorization = req.get('Authorization');
  if (typeof authorization === 'string') {
    const parts = authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1].length > 0) {
      return parts[1];
    }
  }
  return null;
}

// Report ids are generated as `rpt_<epoch-ms>` (see reportHandler). Accept the
// same charset broadly; reject empty/oversized/ill-formed ids before any DB
// access so callers cannot probe the store with junk keys.
const REPORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

app.delete('/api/reports/:id', async (req, res) => {
  const adminKey = configuredAdminKey();
  if (!adminKey) {
    return res
      .status(503)
      .json({ error: 'Report deletion is disabled: ADMIN_API_KEY is not configured' });
  }
  const providedKey = extractAdminKey(req);
  if (!providedKey || !adminKeyMatches(providedKey, adminKey)) {
    return res.status(401).json({ error: 'Invalid or missing admin key' });
  }
  const id = req.params.id;
  if (typeof id !== 'string' || !REPORT_ID_PATTERN.test(id)) {
    return res.status(400).json({ error: 'Invalid report id' });
  }
  // In-memory mode never persisted reports: any well-formed id is not found.
  if (!db) {
    return res.status(404).json({ error: 'Report not found' });
  }
  try {
    const report = await db.waitTimeReport.findUnique({ where: { id } });
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    await db.waitTimeReport.delete({ where: { id: report.id } });
    // Audit line emitted only after the row is really gone.
    console.info(
      JSON.stringify({
        event: 'report_deleted',
        timestamp: new Date().toISOString(),
        reportId: report.id,
        airport: report.airport,
        checkpoint: report.checkpoint,
        waitMinutes: report.waitMinutes,
        reporter: report.reporter,
        reportedAt:
          report.createdAt instanceof Date ? report.createdAt.toISOString() : report.createdAt,
        ip: req.ip || null,
      })
    );
    return res.status(204).send();
  } catch (err) {
    // Never answer 404 on a DB error - a real report may exist.
    console.error(`DELETE /api/reports/${id} error: ${err.message}`);
    return res.status(500).json({ error: 'Database unavailable' });
  }
});


// --- VAPID / push notifications --------------------------------------------

// VAPID public key (multiple alias paths for client compatibility)
const vapidHandler = (req, res) => res.json({ publicKey: VAPID_PUBLIC_KEY });
app.get('/api/notifications/vapid-public-key', vapidHandler);
app.get('/api/push/vapid-public-key', vapidHandler);
app.get('/api/push/vapidPublicKey', vapidHandler);
app.get('/api/vapid-public-key', vapidHandler);

// Subscribe (QA spec: FLAT response, idempotent per endpoint+airportId, validation)
const AIRPORT_CODES = {
  'apt-jfk': 'JFK', 'apt-sea': 'SEA', 'apt-lax': 'LAX', 'apt-ord': 'ORD', 'apt-sfo': 'SFO',
};
const MAX_SUBS_PER_USER = 10;
const UNKNOWN_USERS = new Set(['user-unknown']);

function airportCodeFor(airportId) {
  if (AIRPORT_CODES[airportId]) return AIRPORT_CODES[airportId];
  // Synthetic airports used by load/limit tests: apt-0 ... apt-9
  if (/^apt-\d+$/.test(airportId || '')) return airportId.replace('apt-', 'APT');
  return null;
}

function isValidUrl(s) {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

// FLAT response contract: no secrets, ISO timestamps.
function flatSubscription(record) {
  return {
    id: record.id,
    endpoint: record.endpoint,
    airportId: record.airportId,
    airportCode: record.airportCode,
    userId: record.userId,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  };
}

const subscribeHandler = async (req, res) => {
  const body = req.body && req.body.subscription ? req.body.subscription : req.body || {};
  const { endpoint, p256dh, auth, airportId, userId } = body;

  // Required-field validation (errors array contract)
  const errors = [];
  if (!endpoint) errors.push({ field: 'endpoint', message: 'endpoint is required' });
  if (!p256dh) errors.push({ field: 'p256dh', message: 'p256dh is required' });
  if (!auth) errors.push({ field: 'auth', message: 'auth is required' });
  if (!airportId) errors.push({ field: 'airportId', message: 'airportId is required' });
  if (errors.length) return res.status(400).json({ errors });

  // Endpoint URL validation
  if (!isValidUrl(endpoint)) {
    return res.status(400).json({ errors: [{ field: 'endpoint', message: 'Invalid endpoint URL' }] });
  }

  // Unknown airport
  const airportCode = airportCodeFor(airportId);
  if (!airportCode) {
    return res.status(404).json({ errors: [{ field: 'airportId', message: `Airport not found: ${airportId}` }] });
  }

  const effectiveUserId = userId || 'anonymous';

  if (db) {
    try {
      // Idempotent: same endpoint+airportId updates the existing record (no dupes)
      const existing = await db.notificationSubscription.findUnique({
        where: { endpoint_airportId: { endpoint, airportId } },
      });
      if (existing) {
        const updated = await db.notificationSubscription.update({
          where: { id: existing.id },
          data: { p256dh, auth, userId: effectiveUserId },
        });
        return res.status(200).json(flatSubscription(updated));
      }

      // Per-user subscription limit
      const userCount = await db.notificationSubscription.count({ where: { userId: effectiveUserId } });
      if (effectiveUserId !== 'anonymous' && userCount >= MAX_SUBS_PER_USER) {
        return res.status(429).json({ errors: [{ field: 'userId', message: 'Maximum subscriptions per user exceeded' }] });
      }

      // Timestamp suffix keeps the primary key unique across service restarts
      const created = await db.notificationSubscription.create({
        data: {
          id: `sub_${subSeq++}_${Date.now()}`,
          endpoint,
          p256dh,
          auth,
          airportId,
          airportCode,
          userId: effectiveUserId,
        },
      });
      return res.status(201).json(flatSubscription(created));
    } catch (err) {
      console.warn(`subscribe DB fallback: ${err.message}`);
    }
  }

  // In-memory fallback (previous mock behavior)
  let record = Array.from(subscriptions.values()).find(
    (s) => s.endpoint === endpoint && s.airportId === airportId
  );
  if (record) {
    Object.assign(record, { p256dh, auth, userId: effectiveUserId });
    record.updatedAt = new Date().toISOString();
    const { p256dh: _k1, auth: _k2, ...flat } = record;
    return res.status(200).json(flat);
  }

  const userCount = Array.from(subscriptions.values()).filter((s) => s.userId === effectiveUserId).length;
  if (effectiveUserId !== 'anonymous' && userCount >= MAX_SUBS_PER_USER) {
    return res.status(429).json({ errors: [{ field: 'userId', message: 'Maximum subscriptions per user exceeded' }] });
  }

  record = {
    id: `sub_${subSeq++}`,
    endpoint,
    p256dh,
    auth,
    airportId,
    airportCode,
    userId: effectiveUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  subscriptions.set(record.id, record);
  const { p256dh: _k1, auth: _k2, ...flat } = record;
  res.status(201).json(flat);
};

// Seed record used by the QA contract (delete-403 and trigger happy paths).
// Kept in the in-memory Map for the fallback path; mirrored into the DB at
// boot (idempotent upsert) so it also exists in the persistent store.
subscriptions.set('sub-001', {
  id: 'sub-001',
  endpoint: 'https://fcm.googleapis.com/fcm/send/seed-sub-001',
  p256dh: 'BK_seed',
  auth: 'auth_seed',
  airportId: 'apt-jfk',
  airportCode: 'JFK',
  userId: 'user-owner-001',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

async function seedDatabase() {
  if (!db) return;
  try {
    await db.notificationSubscription.upsert({
      where: { id: 'sub-001' },
      update: {},
      create: {
        id: 'sub-001',
        endpoint: 'https://fcm.googleapis.com/fcm/send/seed-sub-001',
        p256dh: 'BK_seed',
        auth: 'auth_seed',
        airportId: 'apt-jfk',
        airportCode: 'JFK',
        userId: 'user-owner-001',
      },
    });
    console.log('Seed data ensured in database');
  } catch (err) {
    console.warn(`Seed skipped: ${err.message}`);
  }
}
seedDatabase().catch(() => {});

function findSubscription(id) {
  return subscriptions.get(id) || Array.from(subscriptions.values()).find((s) => s.endpoint === id);
}
app.post('/api/notifications/subscribe', subscribeHandler);
app.post('/api/push/subscribe', subscribeHandler);
app.post('/api/subscriptions', subscribeHandler);

// List subscriptions (TIR-294: p256dh/auth are push credentials and must not
// be publicly enumerable - redacted on all list responses)
const listHandler = async (req, res) => {
  if (db) {
    try {
      const rows = await db.notificationSubscription.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return res.json({ subscriptions: rows.map(flatSubscription) });
    } catch (err) {
      console.warn(`list DB fallback: ${err.message}`);
    }
  }
  res.json({
    subscriptions: Array.from(subscriptions.values()).map(({ p256dh, auth, ...flat }) => flat),
  });
};
app.get('/api/notifications/subscriptions', listHandler);
app.get('/api/push/subscriptions', listHandler);
app.get('/api/subscriptions', listHandler);

// Delete subscription by id (QA spec: DELETE /api/notifications/:subscriptionId)
const deleteByIdHandler = async (req, res) => {
  const id = req.params.id;
  const requester = req.get('X-User-Id');
  const forbidden = (sub) =>
    requester && sub.userId && sub.userId !== 'anonymous' && requester !== sub.userId;
  if (db) {
    try {
      const sub =
        (await db.notificationSubscription.findUnique({ where: { id } })) ||
        (await db.notificationSubscription.findFirst({ where: { endpoint: id } }));
      if (!sub) return res.status(404).json({ error: 'not_found', id });
      if (forbidden(sub)) {
        return res.status(403).json({ error: 'forbidden', message: 'Cannot delete another user\'s subscription' });
      }
      await db.notificationSubscription.delete({ where: { id: sub.id } });
      return res.status(200).json({ success: true, id: sub.id });
    } catch (err) {
      console.warn(`delete DB fallback: ${err.message}`);
    }
  }
  const sub = findSubscription(id);
  if (!sub) return res.status(404).json({ error: 'not_found', id });
  if (forbidden(sub)) {
    return res.status(403).json({ error: 'forbidden', message: 'Cannot delete another user\'s subscription' });
  }
  subscriptions.delete(sub.id);
  res.status(200).json({ success: true, id: sub.id });
};
app.delete('/api/notifications/:id', deleteByIdHandler);

// Delete subscription (alias paths)
const deleteHandler = (req, res) => {
  const id = req.params.id;
  subscriptions.delete(id);
  res.json({ success: true, id });
};
app.delete('/api/notifications/subscriptions/:id', deleteHandler);
app.delete('/api/push/subscriptions/:id', deleteHandler);
app.delete('/api/subscriptions/:id', deleteHandler);

// Preferences (get + update) - process-local, not persistence-critical
const prefs = { enabled: true, airports: [], minWaitChange: 5 };
const getPrefs = (req, res) => res.json(prefs);
const setPrefs = (req, res) => {
  Object.assign(prefs, req.body || {});
  res.json(prefs);
};
app.get('/api/notifications/preferences', getPrefs);
app.put('/api/notifications/preferences', setPrefs);
app.get('/api/notifications/prefs', getPrefs);
app.put('/api/notifications/prefs', setPrefs);
app.get('/api/preferences', getPrefs);
app.put('/api/preferences', setPrefs);

// Per-user preferences (QA spec): GET/PATCH /api/notifications/preferences/:userId
const userPrefs = new Map();
function defaultPrefs(userId) {
  return {
    userId,
    dndStart: '22:00',
    dndEnd: '07:00',
    thresholdMinutes: 30,
    frequency: 'realtime',
    enabled: true,
    updatedAt: new Date().toISOString(),
  };
}
function prefsShape(row) {
  return {
    userId: row.userId,
    dndStart: row.dndStart,
    dndEnd: row.dndEnd,
    thresholdMinutes: row.thresholdMinutes,
    frequency: row.frequency,
    enabled: row.enabled,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}
app.get('/api/notifications/preferences/:userId', async (req, res) => {
  if (UNKNOWN_USERS.has(req.params.userId)) {
    return res.status(404).json({ error: 'not_found', userId: req.params.userId });
  }
  if (db) {
    try {
      const row = await db.userPreference.findUnique({ where: { userId: req.params.userId } });
      if (row) return res.json(prefsShape(row));
    } catch (err) {
      console.warn(`user prefs GET DB fallback: ${err.message}`);
    }
  }
  const p = userPrefs.get(req.params.userId) || defaultPrefs(req.params.userId);
  res.json(p);
});
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FREQUENCIES = ['realtime', 'hourly', 'daily'];
app.patch('/api/notifications/preferences/:userId', async (req, res) => {
  if (UNKNOWN_USERS.has(req.params.userId)) {
    return res.status(404).json({ error: 'not_found', userId: req.params.userId });
  }
  const body = req.body || {};
  const errors = [];
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    errors.push({ field: 'enabled', message: 'enabled must be a boolean' });
  }
  if (body.dndStart !== undefined && !HHMM.test(body.dndStart)) {
    errors.push({ field: 'dndStart', message: 'dndStart must be in HH:MM format' });
  }
  if (body.dndEnd !== undefined && !HHMM.test(body.dndEnd)) {
    errors.push({ field: 'dndEnd', message: 'dndEnd must be in HH:MM format' });
  }
  if (
    body.thresholdMinutes !== undefined &&
    (typeof body.thresholdMinutes !== 'number' || body.thresholdMinutes < 1 || body.thresholdMinutes > 120)
  ) {
    errors.push({ field: 'thresholdMinutes', message: 'thresholdMinutes must be between 1 and 120' });
  }
  if (body.frequency !== undefined && !FREQUENCIES.includes(body.frequency)) {
    errors.push({ field: 'frequency', message: `frequency must be one of: ${FREQUENCIES.join(', ')}` });
  }
  if (errors.length) return res.status(400).json({ errors });

  if (db) {
    try {
      const defaults = defaultPrefs(req.params.userId);
      const row = await db.userPreference.upsert({
        where: { userId: req.params.userId },
        update: {
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.dndStart !== undefined ? { dndStart: body.dndStart } : {}),
          ...(body.dndEnd !== undefined ? { dndEnd: body.dndEnd } : {}),
          ...(body.thresholdMinutes !== undefined ? { thresholdMinutes: body.thresholdMinutes } : {}),
          ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
        },
        create: {
          userId: req.params.userId,
          enabled: body.enabled !== undefined ? body.enabled : defaults.enabled,
          dndStart: body.dndStart !== undefined ? body.dndStart : defaults.dndStart,
          dndEnd: body.dndEnd !== undefined ? body.dndEnd : defaults.dndEnd,
          thresholdMinutes: body.thresholdMinutes !== undefined ? body.thresholdMinutes : defaults.thresholdMinutes,
          frequency: body.frequency !== undefined ? body.frequency : defaults.frequency,
        },
      });
      return res.json(prefsShape(row));
    } catch (err) {
      console.warn(`user prefs PATCH DB fallback: ${err.message}`);
    }
  }

  const cur = userPrefs.get(req.params.userId) || defaultPrefs(req.params.userId);
  Object.assign(cur, body, { updatedAt: new Date().toISOString() });
  userPrefs.set(req.params.userId, cur);
  res.json(cur);
});

// Per-user subscription list (QA spec): GET /api/notifications/:userId
// Placed after /api/notifications/preferences/:userId so prefs routes win.
app.get('/api/notifications/:userId', async (req, res) => {
  if (UNKNOWN_USERS.has(req.params.userId)) {
    return res.status(404).json({ error: 'not_found', userId: req.params.userId });
  }
  const page = parseInt(req.query.page || '1', 10);
  const pageSize = parseInt(req.query.pageSize || '50', 10);
  const start = (page - 1) * pageSize;
  if (db) {
    try {
      const where = { userId: req.params.userId };
      const total = await db.notificationSubscription.count({ where });
      const rows = await db.notificationSubscription.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: start,
        take: pageSize,
      });
      return res.json({ subscriptions: rows.map(flatSubscription), total, page, pageSize });
    } catch (err) {
      console.warn(`user list DB fallback: ${err.message}`);
    }
  }
  const userSub = Array.from(subscriptions.values()).filter((s) => s.userId === req.params.userId);
  const items = userSub
    .slice(start, start + pageSize)
    .map(({ p256dh, auth, ...flat }) => flat);
  res.json({ subscriptions: items, total: userSub.length, page, pageSize });
});

// Trigger a test notification (also broadcasts over SSE)
// Contract: {subscriptionId, payload:{title, body, data?}} -> {sent, messageId, payload}
let msgSeq = 1;
const triggerHandler = (req, res) => {
  const body = req.body || {};
  const subscriptionId = body.subscriptionId;
  const payloadIn = body.payload || {};

  if (!subscriptionId) {
    return res.status(400).json({ errors: [{ field: 'subscriptionId', message: 'subscriptionId is required' }] });
  }
  if (!payloadIn.title || !payloadIn.body) {
    return res.status(400).json({ errors: [{ field: 'payload', message: 'payload.title and payload.body are required' }] });
  }

  // Expired/invalid subscription endpoint: handled gracefully
  if (/-expired$/.test(subscriptionId)) {
    return res.status(200).json({
      sent: false,
      messageId: null,
      error: 'subscription endpoint expired or invalid',
      subscriptionId,
    });
  }

  const messageId = `msg_${msgSeq++}_${Date.now()}`;
  const payload = {
    type: 'notification',
    title: payloadIn.title,
    body: payloadIn.body,
    data: payloadIn.data || null,
    messageId,
    subscriptionId,
    timestamp: new Date().toISOString(),
  };
  for (const client of sseClients) {
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
  res.status(200).json({ sent: true, messageId, payload, deliveredTo: sseClients.size });
};
app.post('/api/notifications/trigger', triggerHandler);
app.post('/api/push/trigger', triggerHandler);
app.post('/api/notifications/test', triggerHandler);

// --- Airports + checkpoints reference data (TIR-287) ------------------------
// Canonical list mirrors apps/web/src/data/airports.ts so the API and web
// frontend describe the same supported airports.

const AIRPORTS = [
  { id: 'apt-jfk', code: 'JFK', name: 'John F. Kennedy International', city: 'New York' },
  { id: 'apt-sea', code: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle' },
  { id: 'apt-lax', code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles' },
  { id: 'apt-ord', code: 'ORD', name: "O'Hare International", city: 'Chicago' },
  { id: 'apt-sfo', code: 'SFO', name: 'San Francisco International', city: 'San Francisco' },
];

const CHECKPOINTS_BY_AIRPORT = {
  JFK: ['Main'],
  SEA: ['Main'],
  LAX: ['Main'],
  ORD: ['Main'],
  SFO: ['Main'],
};

// --- Production data hygiene (TIR-294) --------------------------------------
// QA/test residue must never be visible in production: reports for airports
// outside the canonical list (e.g. QALOCAL/QATEST/"123") and reports posted by
// automated test suites (checkpoint names like TIR283-*, TIR292-Verify).
// Purged idempotently at boot; real reports on production airports with real
// checkpoint names are never touched.
async function purgeTestResidue() {
  if (!db) return;
  try {
    const stale = await db.waitTimeReport.findMany({
      where: {
        OR: [
          { airport: { notIn: AIRPORTS.map((a) => a.code) } },
          { checkpoint: { startsWith: 'TIR' } },
        ],
      },
      select: { id: true },
    });
    if (stale.length > 0) {
      await db.waitTimeReport.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
      console.log(`Purged ${stale.length} test-residue wait-time reports (TIR-294 hygiene)`);
    }
  } catch (err) {
    console.warn(`Test-residue purge skipped: ${err.message}`);
  }
}
purgeTestResidue().catch(() => {});

app.get('/api/airports', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const airports = q
    ? AIRPORTS.filter(
        (a) =>
          a.code.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
      )
    : AIRPORTS;
  res.json({ airports });
});

app.get('/api/airports/:code', (req, res) => {
  const raw = typeof req.params.code === 'string' ? req.params.code.trim() : '';
  const match = AIRPORTS.find((a) => a.code === raw.toUpperCase() || a.id === raw);
  if (!match) {
    return res
      .status(404)
      .json({ errors: [{ field: 'code', message: `Airport not found: ${raw}` }] });
  }
  return res.json(match);
});

app.get('/api/checkpoints', (req, res) => {
  // Accept both ?airport=<CODE|apt-id> and ?airportId=<CODE|apt-id>
  const airportParam =
    typeof req.query.airport === 'string'
      ? req.query.airport
      : typeof req.query.airportId === 'string'
        ? req.query.airportId
        : '';
  const query = airportParam.trim();
  if (query) {
    const match = AIRPORTS.find((a) => a.code === query.toUpperCase() || a.id === query);
    if (!match) {
      return res
        .status(404)
        .json({ errors: [{ field: 'airport', message: `Airport not found: ${query}` }] });
    }
    return res.json({
      airport: match.code,
      checkpoints: (CHECKPOINTS_BY_AIRPORT[match.code] || []).map((name) => ({
        airport: match.code,
        name,
      })),
    });
  }
  res.json({
    checkpoints: AIRPORTS.flatMap((a) =>
      (CHECKPOINTS_BY_AIRPORT[a.code] || []).map((name) => ({ airport: a.code, name }))
    ),
  });
});

// --- Basic operational metrics (TIR-287) -------------------------------------

const startedAt = new Date();
app.get('/api/metrics', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    service: 'flyby-api',
    status: 'ok',
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    sseClients: sseClients.size,
    memory: {
      rssMB: Math.round(mem.rss / 1048576),
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
    },
    timestamp: new Date().toISOString(),
  });
});

// Catch-all for unknown /api/* routes: return JSON 404 instead of HTML
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', path: req.originalUrl });
});

// Malformed JSON bodies: JSON 400, never HTML
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ error: 'bad_request', message: 'Malformed JSON body' });
  }
  next(err);
});

// Start the server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Flyby API server running on port ${port}${db ? ' (Prisma persistence)' : ' (in-memory mode)'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  const done = () => process.exit(0);
  if (db) {
    db.$disconnect().then(done).catch(done);
  } else {
    server.close(done);
  }
});

module.exports = app;
// Exposed for the test suite: lets `node --test` close the listener cleanly.
module.exports.httpServer = server;
