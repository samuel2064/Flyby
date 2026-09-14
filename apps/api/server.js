const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Permissive CORS for the E2E test environment
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
// Mock backend for E2E happy-path tests (SSE, VAPID/push, wait times)
// In-memory, no persistence - sufficient for QA test environment (TIR-269).
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

// --- Wait times (sample data) ----------------------------------------------

app.get('/api/wait-times', (req, res) => {
  const airport = req.query.airport || 'SEA';
  res.json([
    {
      airport,
      checkpoint: 'Main',
      waitMinutes: 12,
      updatedAt: new Date().toISOString(),
    },
  ]);
});

app.post('/api/wait-times/report', (req, res) => {
  res.status(201).json({ id: `rpt_${Date.now()}`, ...req.body, receivedAt: new Date().toISOString() });
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

const subscribeHandler = (req, res) => {
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

  // Idempotent: same endpoint+airportId updates the existing record (no dupes, safe under concurrency)
  let record = Array.from(subscriptions.values()).find(
    (s) => s.endpoint === endpoint && s.airportId === airportId
  );
  if (record) {
    Object.assign(record, { p256dh, auth, userId: effectiveUserId });
    record.updatedAt = new Date().toISOString();
    const { p256dh: _k1, auth: _k2, ...flat } = record;
    return res.status(200).json(flat);
  }

  // Per-user subscription limit
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

// Seed records used by the QA contract (delete-403 and trigger happy paths)
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

function findSubscription(id) {
  return subscriptions.get(id) || Array.from(subscriptions.values()).find((s) => s.endpoint === id);
}
app.post('/api/notifications/subscribe', subscribeHandler);
app.post('/api/push/subscribe', subscribeHandler);
app.post('/api/subscriptions', subscribeHandler);

// List subscriptions
const listHandler = (req, res) => res.json({ subscriptions: Array.from(subscriptions.values()) });
app.get('/api/notifications/subscriptions', listHandler);
app.get('/api/push/subscriptions', listHandler);
app.get('/api/subscriptions', listHandler);

// Per-user subscription list (QA spec): GET /api/notifications/:userId
// Registered after preferences routes (see below) so it doesn't shadow them.
// With ?page=&pageSize= pagination support.

// Delete subscription by id (QA spec: DELETE /api/notifications/:subscriptionId)
app.delete('/api/notifications/:id', (req, res) => {
  const sub = findSubscription(req.params.id);
  if (!sub) return res.status(404).json({ error: 'not_found', id: req.params.id });
  const requester = req.get('X-User-Id');
  if (requester && sub.userId && sub.userId !== 'anonymous' && requester !== sub.userId) {
    return res.status(403).json({ error: 'forbidden', message: 'Cannot delete another user\'s subscription' });
  }
  subscriptions.delete(sub.id);
  res.status(200).json({ success: true, id: sub.id });
});

// Delete subscription
const deleteHandler = (req, res) => {
  const id = req.params.id;
  subscriptions.delete(id);
  res.json({ success: true, id });
};
app.delete('/api/notifications/subscriptions/:id', deleteHandler);
app.delete('/api/push/subscriptions/:id', deleteHandler);
app.delete('/api/subscriptions/:id', deleteHandler);

// Preferences (get + update)
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
app.get('/api/notifications/preferences/:userId', (req, res) => {
  if (UNKNOWN_USERS.has(req.params.userId)) {
    return res.status(404).json({ error: 'not_found', userId: req.params.userId });
  }
  const p = userPrefs.get(req.params.userId) || defaultPrefs(req.params.userId);
  res.json(p);
});
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FREQUENCIES = ['realtime', 'hourly', 'daily'];
app.patch('/api/notifications/preferences/:userId', (req, res) => {
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
  const cur = userPrefs.get(req.params.userId) || defaultPrefs(req.params.userId);
  Object.assign(cur, body, { updatedAt: new Date().toISOString() });
  userPrefs.set(req.params.userId, cur);
  res.json(cur);
});

// Per-user subscription list (QA spec): GET /api/notifications/:userId
// Placed after /api/notifications/preferences/:userId so prefs routes win.
app.get('/api/notifications/:userId', (req, res) => {
  if (UNKNOWN_USERS.has(req.params.userId)) {
    return res.status(404).json({ error: 'not_found', userId: req.params.userId });
  }
  const userSub = Array.from(subscriptions.values()).filter((s) => s.userId === req.params.userId);
  const page = parseInt(req.query.page || '1', 10);
  const pageSize = parseInt(req.query.pageSize || '50', 10);
  const start = (page - 1) * pageSize;
  const items = userSub.slice(start, start + pageSize);
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

// Catch-all for unknown /api/* routes: return JSON 404 instead of HTML
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', path: req.originalUrl });
});

// Start the server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Flyby API server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;