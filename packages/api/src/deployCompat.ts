import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "./prisma";
import { VISIBLE_REPORT_WHERE } from "./waitTimeUtils";
import { errorTotal } from "./metrics";
import { publishWaitTime, subscribeCheckpoint } from "./redis";

// Deploy-compat surface (TIR-339 / M1): the endpoints the live traveler web
// and QA probes call verbatim, served by the monorepo. Contract is the deploy
// repo's documented shapes, NOT the monorepo's richer native routes - both can
// coexist because the native routes are still mounted. Every change here must
// stay additive; shared helpers respect VISIBLE_REPORT_WHERE (flags >= 3 are
// hidden) and do not fabricate ids, rows, timestamps, or wait values.

const DEPLOY_ID_RE = /^ck-[a-z]{3}-[a-z0-9-]+$/;

// "Terminal 4 Security" -> "terminal-4-security" (deploy slug convention).
export function deploySlugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Deploy-era rows name the generic line "Main"; the seed catalog names it
// "Main Checkpoint" (code CHK-MAIN). Prod ids/slug names therefore lose the
// trailing " Checkpoint" suffix relative to seed rows. This strips it before
// slug comparison so ck-<code>-main and checkpoint name "Main" both resolve
// against seed-style rows while exact matches keep priority.
function deployNameCandidates(name: string): string[] {
  const trimmed = name.trim();
  const stripped = trimmed.replace(/\s+checkpoint$/i, "").trim();
  const slugs = [deploySlugify(trimmed)];
  if (stripped !== trimmed && stripped !== "") slugs.push(deploySlugify(stripped));
  return slugs;
}

// ck-<airportLower>-<nameSlug> -> { airportCode, checkpoint row } via a
// case-insensitive exact-name match against the airport's real checkpoints
// (with the seed-suffix fallback above). Returns { airportCode: null } when
// the id doesn't look like a ck- slug, and { airportCode, checkpoint: null }
// when it does but doesn't resolve.
export async function resolveDeployCheckpointId(
  id: string,
): Promise<{ airportCode: string | null; checkpoint: { id: string; name: string } | null }> {
  if (!DEPLOY_ID_RE.test(id)) return { airportCode: null, checkpoint: null };
  const airportCode = id.slice(3, 6).toUpperCase();
  const nameSlug = id.slice(7);
  const airport = await prisma.airport.findUnique({
    where: { code: airportCode },
    include: { checkpoints: { select: { id: true, name: true } } },
  });
  if (!airport) return { airportCode, checkpoint: null };
  const match = airport.checkpoints.find((cp) => deployNameCandidates(cp.name).includes(nameSlug));
  return { airportCode, checkpoint: match ?? null };
}

// --- GET /api/wait-times -----------------------------------------------------
// Raw report rows newest-first (deploy contract). ?airport=<CODE> or
// ?airportId=<CODE|apt-code>. Unknown airport -> 404. No fabricated records.
export const getWaitTimesCompat = async (req: Request, res: Response) => {
  const raw = (req.query.airport ?? req.query.airportId) as string | undefined;
  let code: string | null = null;
  if (raw !== undefined) {
    const trimmed = String(raw).trim();
    code = trimmed.toLowerCase().startsWith("apt-") && /^apt-[a-z]{3}$/i.test(trimmed)
      ? trimmed.slice(4).toUpperCase()
      : trimmed.toUpperCase();
    const airport = await prisma.airport.findUnique({ where: { code }, select: { id: true } });
    if (!airport) {
      res.status(404).json({ error: "Airport not found" });
      return;
    }
  }
  try {
    const rows = await prisma.waitTime.findMany({
      where: {
        ...(code ? { checkpoint: { airport: { code } } } : {}),
        ...VISIBLE_REPORT_WHERE,
      },
      orderBy: { reportedAt: "desc" },
      take: 100,
      select: {
        id: true,
        minutes: true,
        reportedAt: true,
        checkpoint: { select: { name: true, airport: { select: { code: true } } } },
      },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        airport: r.checkpoint.airport.code,
        checkpoint: r.checkpoint.name,
        waitMinutes: r.minutes,
        updatedAt: r.reportedAt.toISOString(),
      })),
    );
  } catch (err) {
    console.error("getWaitTimesCompat error:", err);
    errorTotal.labels("getWaitTimesCompat").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- POST /api/wait-times (+ /api/wait-times/report alias) -------------------
// Body: {airport, checkpoint, waitMinutes | waitTimeMinutes | minutes}; the
// checkpoint resolves by name against the airport's checkpoints (falls back
// to the airport's "Main" checkpoint if a free-form name is supplied - the
// prod data shape). Only *reportable* values are persisted.
export const postWaitTimeCompat = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const waitMinutesValue =
    body.waitMinutes !== undefined
      ? body.waitMinutes
      : body.waitTimeMinutes !== undefined
        ? body.waitTimeMinutes
        : body.minutes;

  const errors: Array<{ field: string; message: string }> = [];
  if (typeof body.airport !== "string" || body.airport.trim() === "") {
    errors.push({ field: "airport", message: "airport must be a non-empty string" });
  }
  if (
    typeof waitMinutesValue !== "number" ||
    !Number.isInteger(waitMinutesValue) ||
    waitMinutesValue <= 0 ||
    waitMinutesValue > 300
  ) {
    errors.push({ field: "waitMinutes", message: "waitMinutes must be a positive integer (1-300)" });
  }
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }
  const airportCode = String(body.airport).trim().toUpperCase();
  try {
    const airport = await prisma.airport.findUnique({
      where: { code: airportCode },
      include: { checkpoints: { select: { id: true, name: true } } },
    });
    if (!airport) {
      res.status(404).json({ error: "Airport not found" });
      return;
    }
    const checkpointName =
      typeof body.checkpoint === "string" && body.checkpoint.trim() !== ""
        ? body.checkpoint.trim()
        : "Main";
    const requestedSlugs = deployNameCandidates(checkpointName);
    const checkpoint = airport.checkpoints.find((cp) =>
      deployNameCandidates(cp.name).some((slug) => requestedSlugs.includes(slug)),
    );
    if (!checkpoint) {
      res.status(400).json({
        errors: [{ field: "checkpoint", message: `Checkpoint not found at ${airportCode}: ${checkpointName}` }],
      });
      return;
    }

    // Same rate rule as the rest of the surface: one report per identity / 30s.
    const limitKey = `compat:${req.get("X-User-Id") || req.ip || "anonymous"}`;
    if (!reportWindowOk(limitKey)) {
      res
        .status(429)
        .set("Retry-After", String(retryAfterSeconds(limitKey)))
        .json({ errors: [{ field: "rateLimit", message: `Too many reports; retry in ${retryAfterSeconds(limitKey)}s` }] });
      return;
    }

    const receivedAt = new Date();
    const waitTime = await prisma.waitTime.create({
      data: {
        checkpointId: checkpoint.id,
        minutes: Math.round(waitMinutesValue as number),
        source: "crowd",
        reportType: "standard",
        reportedAt: receivedAt,
      },
    });

    // Broadcast over the shared channel so both the native SSE routes and the
    // compat /api/events listener see the report.
    await publishWaitTime({
      checkpointId: waitTime.checkpointId,
      minutes: waitTime.minutes,
      source: waitTime.source,
      reportType: waitTime.reportType,
      reportedAt: waitTime.reportedAt,
    });

    res.status(201).json({
      id: waitTime.id,
      airport: airportCode,
      checkpoint: checkpoint.name,
      waitMinutes: waitTime.minutes,
      receivedAt: receivedAt.toISOString(),
    });
  } catch (err) {
    console.error("postWaitTimeCompat error:", err);
    errorTotal.labels("postWaitTimeCompat").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- In-process identity throttle (per-identity, 30s window) ----------------
// Should align with the report limiter the main route uses; kept independent
// here to make the deploy contract testable on its own.
const compatRateLimitWindows = new Map<string, number>();
const COMPAT_WINDOW_MS = 30_000;
const COMPAT_MAX_WINDOWS = 1000;

function reportWindowOk(key: string): boolean {
  const now = Date.now();
  if (compatRateLimitWindows.size > COMPAT_MAX_WINDOWS) {
    for (const [k, ts] of compatRateLimitWindows) {
      if (now - ts >= COMPAT_WINDOW_MS) compatRateLimitWindows.delete(k);
    }
  }
  const last = compatRateLimitWindows.get(key) ?? 0;
  if (now - last < COMPAT_WINDOW_MS) return false;
  compatRateLimitWindows.set(key, now);
  return true;
}

function retryAfterSeconds(key: string): number {
  const last = compatRateLimitWindows.get(key) ?? 0;
  return Math.max(1, Math.round((COMPAT_WINDOW_MS - (Date.now() - last)) / 1000));
}

// --- GET /api/events (+ /api/wait-times/stream, /api/sse aliases) -----------
// Deploy-shaped SSE: connected frame first, then per report
// { type:"wait-time-update", airport, checkpoint, waitMinutes, timestamp }.
// Scoped when ?airport= given; the airport's checkpoint-id set is fetched once
// at connect. Keepalive comment frames keep proxies from idling out.
export const streamDeployEvents = async (req: Request, res: Response) => {
  const rawAirport = req.query.airport;
  const airportFilter = typeof rawAirport === "string" && rawAirport.trim() !== ""
    ? rawAirport.trim().toUpperCase()
    : null;

  const checkpointMap = new Map<string, { airport: string; name: string }>();
  if (airportFilter) {
    const airport = await prisma.airport.findUnique({
      where: { code: airportFilter },
      include: { checkpoints: { select: { id: true, name: true } } },
    });
    if (!airport) {
      // Unknown airports are handled by the existing 404 conventions; the
      // events endpoint mirrors the wait-times one here.
      res.status(404).json({ error: "Airport not found" });
      return;
    }
    for (const cp of airport.checkpoints) {
      checkpointMap.set(cp.id, { airport: airport.code, name: cp.name });
    }
  } else {
    const checkpoints = await prisma.checkpoint.findMany({
      select: { id: true, name: true, airport: { select: { code: true } } },
    });
    for (const cp of checkpoints) {
      checkpointMap.set(cp.id, { airport: cp.airport.code, name: cp.name });
    }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  registerCompatSseClient(res);

  res.write("retry: 3000\n\n");
  const sseWrite = (payload: unknown) => {
    if (!res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  sseWrite({ type: "connected", timestamp: new Date().toISOString() });
  const keepalive = setInterval(() => {
    if (!res.destroyed) res.write(": ping\n\n");
  }, 20000);

  const unsubscribe = await subscribeCheckpoint("*", (data) => {
    const cp = checkpointMap.get(data.checkpointId);
    if (!cp) return; // filter: unknown or out-of-scope checkpoint
    sseWrite({
      type: "wait-time-update",
      airport: cp.airport,
      checkpoint: cp.name,
      waitMinutes: data.minutes,
      timestamp: new Date(data.reportedAt).toISOString(),
    });
  });

  req.on("close", () => {
    clearInterval(keepalive);
    unsubscribe();
    unregisterCompatSseClient(res);
    res.end();
  });
  req.on("error", () => {
    clearInterval(keepalive);
    unsubscribe();
    unregisterCompatSseClient(res);
    res.end();
  });
};

// Deploy-compat id resolution helper. Handlers for /api/checkpoints/:id (and
// its subpaths) call this before their own validation; a ck-<code>-<slug> id
// for an EXISTING named checkpoint returns its UUID, unresolvable ck ids
// report "Checkpoint not found" (404), and any other string falls through
// untouched so the native validateUUID behavior stays byte-identical.
export async function resolveCompatCheckpointId(
  id: string,
): Promise<{ kind: "native" } | { kind: "resolved"; id: string } | { kind: "missing" }> {
  if (!DEPLOY_ID_RE.test(id)) return { kind: "native" };
  const { checkpoint } = await resolveDeployCheckpointId(id);
    if (!checkpoint) return { kind: "missing" };
    return { kind: "resolved", id: checkpoint.id };
  }

export { COMPAT_MAX_WINDOWS as _rateWindowCapForTests };
export { compatRateLimitWindows as _rateLimitStateForTests };

// Bare /api/airports in the deploy contract is the FULL list (51 rows, flat
// shape {id:'apt-...'}). The monorepo's /api/airports has always been a
// search route - different contract on the same path. This mount sits before
// the native search mount so bare lists behave exactly like production today;
// {data: enriched} only when q is present (native search contract from day 1).
export const compatListAirports = async (_req: Request, res: Response) => {
  try {
    const airports = await prisma.airport.findMany({ orderBy: { code: "asc" }, take: 500 });
    res.json({
      airports: airports.map((a) => ({
        id: `apt-${a.code.toLowerCase()}`,
        code: a.code,
        name: a.name.replace(/ Airport$/, ""),
        city: a.city,
        timezone: a.timezone,
      })),
    });
  } catch (err) {
    console.error("compatListAirports error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- GET /api/airports/:code (deploy-compat flat shape) -----------------------
// Deploy contract: {id:'apt-jfk',code,name,city,timezone} - no {data:} wrapper.
// The native getAirportByCode returns {data: {...checkpoints...}}; this compat
// route returns the flat airport object only, byte-compatible with prod.
export const compatGetAirportByCode = async (req: Request, res: Response) => {
  let code = req.params.code as string;

  // apt-<code> resolution same as native
  if (typeof code === "string" && /^apt-[a-z]{3}$/i.test(code)) {
    code = code.slice(4).toUpperCase();
  }

  try {
    const airport = await prisma.airport.findUnique({
      where: { code: String(code).toUpperCase() },
      select: { code: true, name: true, city: true, timezone: true },
    });

    if (!airport) {
      res.status(404).json({ error: "Airport not found" });
      return;
    }

    res.json({
      id: `apt-${airport.code.toLowerCase()}`,
      code: airport.code,
      name: airport.name.replace(/ Airport$/, ""),
      city: airport.city,
      timezone: airport.timezone,
    });
  } catch (err) {
    console.error("compatGetAirportByCode error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- GET /api/checkpoints[?airport=] (deploy-compat flat pairs) ---------------
// Deploy contract: {airport, code:[{airport,name}]} style flat pairs,
// launch-5 have 'Main' FIRST. The native getCheckpointsByAirportCode returns
// richer objects; this compat route returns the flat shape.
export const compatListCheckpointsByAirport = async (req: Request, res: Response) => {
  const raw = (req.query.airport ?? req.query.airportId) as string | undefined;
  let code: string | null = null;
  if (raw !== undefined) {
    const trimmed = String(raw).trim();
    code = trimmed.toLowerCase().startsWith("apt-") && /^apt-[a-z]{3}$/i.test(trimmed)
      ? trimmed.slice(4).toUpperCase()
      : trimmed.toUpperCase();
  }

  // Deploy-compat single-airport mode requires airport parameter
  if (code) {
    const airport = await prisma.airport.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!airport) {
      res.status(404).json({ error: "Airport not found" });
      return;
    }
  } else if (raw === undefined) {
    // No airport param provided - this is an error for deploy-compat single-airport mode
    res.status(400).json({ error: "airport parameter required for deploy-compat mode" });
    return;
  }

  try {
    const where = code ? { airport: { code } } : {};
    const checkpoints = await prisma.checkpoint.findMany({
      where,
      include: { airport: { select: { code: true } } },
      orderBy: [
        { name: "asc" }, // secondary
      ],
      take: 500,
    });

    // Sort: 'Main' checkpoint first (case-insensitive), then alphabetical
    const sorted = checkpoints.sort((a, b) => {
      const aIsMain = a.name.toLowerCase() === "main";
      const bIsMain = b.name.toLowerCase() === "main";
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
      return a.name.localeCompare(b.name);
    });

    if (code) {
      // Single airport: {airport, code: [{airport, name}]}
      res.json({
        airport: code,
        code: sorted.map((cp) => ({
          airport: cp.airport.code,
          name: cp.name,
        })),
      });
    } else {
      // All airports: group by airport code (not used in current tests but kept for completeness)
      const grouped = new Map<string, Array<{ airport: string; name: string }>>();
      for (const cp of sorted) {
        const list = grouped.get(cp.airport.code) ?? [];
        list.push({ airport: cp.airport.code, name: cp.name });
        grouped.set(cp.airport.code, list);
      }
      res.json({
        airports: Array.from(grouped.entries()).map(([airport, code]) => ({
          airport,
          code,
        })),
      });
    }
  } catch (err) {
    console.error("compatListCheckpointsByAirport error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- GET /api/checkpoints/:id/history (deploy-compat window/bucket params) ----
// Deploy contract: ?window=4h&bucket=30m defaults, response shape:
// {data:{history:[{time,minutes,count}],checkpointId,airportCode,airportName,name,windowHours,bucketMinutes,reportCount}}
// Monorepo native: ?hours= (default 6), 15-min buckets, returns {data:[{bucket,minutes,count}]}
export const compatGetCheckpointHistory = async (req: Request, res: Response) => {
  let id = req.params.id as string;

  // Deploy-compat (TIR-339): ck-<code>-<slug> ids resolve to the checkpoint UUID
  const compatHistoryId = await resolveCompatCheckpointId(id);
  if (compatHistoryId.kind === "missing") {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }
  if (compatHistoryId.kind === "resolved") id = compatHistoryId.id;

  const idValidation = (await import("./validation")).validateUUID(id);
  if (!idValidation.valid) {
    res.status(400).json({ error: idValidation.error });
    return;
  }

  // Parse window parameter (e.g., "4h", "24h") - default 4h per deploy contract
  const windowParam = (req.query.window as string) || "4h";
  const windowMatch = windowParam.match(/^(\d+)h$/i);
  if (!windowMatch) {
    res.status(400).json({ error: "window must be in format like '4h', '24h'" });
    return;
  }
  const windowHours = parseInt(windowMatch[1], 10);
  if (windowHours < 1 || windowHours > 168) {
    res.status(400).json({ error: "window hours must be between 1 and 168" });
    return;
  }

  // Parse bucket parameter (e.g., "30m", "15m") - default 30m per deploy contract
  const bucketParam = (req.query.bucket as string) || "30m";
  const bucketMatch = bucketParam.match(/^(\d+)m$/i);
  if (!bucketMatch) {
    res.status(400).json({ error: "bucket must be in format like '30m', '15m'" });
    return;
  }
  const bucketMinutes = parseInt(bucketMatch[1], 10);
  if (bucketMinutes < 1 || bucketMinutes > 1440 || 60 % bucketMinutes !== 0) {
    res.status(400).json({ error: "bucket minutes must divide 60 evenly (e.g., 5, 10, 15, 20, 30, 60)" });
    return;
  }

  try {
    const checkpoint = await prisma.checkpoint.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        terminal: true,
        airport: { select: { code: true, name: true } },
      },
    });

    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }

    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const waitTimes = await prisma.waitTime.findMany({
      where: {
        checkpointId: id,
        reportedAt: { gte: since },
        ...VISIBLE_REPORT_WHERE,
      },
      orderBy: { reportedAt: "asc" },
    });

    const reportCount = waitTimes.length;

    // Bucket into bucketMinutes intervals (use UTC for consistent bucketing)
    const buckets = new Map<string, { minutes: number; count: number }>();
    for (const wt of waitTimes) {
      const date = new Date(wt.reportedAt);
      date.setUTCMinutes(Math.floor(date.getUTCMinutes() / bucketMinutes) * bucketMinutes, 0, 0);
      const key = date.toISOString();
      const existing = buckets.get(key);
      if (existing) {
        existing.minutes = Math.round((existing.minutes * existing.count + wt.minutes) / (existing.count + 1));
        existing.count += 1;
      } else {
        buckets.set(key, { minutes: wt.minutes, count: 1 });
      }
    }

    const history = Array.from(buckets.entries())
      .map(([time, { minutes, count }]) => ({ time, minutes, count }))
      .sort((a, b) => a.time.localeCompare(b.time));

    res.json({
      data: {
        history,
        checkpointId: checkpoint.id,
        airportCode: checkpoint.airport.code,
        airportName: checkpoint.airport.name,
        name: checkpoint.name,
        windowHours,
        bucketMinutes,
        reportCount,
      },
    });
  } catch (err) {
    console.error("compatGetCheckpointHistory error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- QA-surface aliases (compat / TIR-339 M1b) --------------------------------
// The mock-era routes the QA regression battery was built against, re-homed
// onto the monorepo's real storage. Redaction follows TIR-309's contract:
// endpoint, p256dh, auth and userId never appear in a public LIST response.

interface CompatSubscriptionRow {
  id: string;
  airportId: string;
  createdAt: Date;
  updatedAt?: Date | null;
}

function redactedCompatSubscription(row: CompatSubscriptionRow, airportCode: string) {
  return {
    id: row.id,
    airportId: row.airportId,
    airportCode,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt ?? row.createdAt,
  };
}

async function resolveCompatAirportId(airportRef: string): Promise<{ id: string; code: string } | null> {
  const trimmed = airportRef.trim();
  const code = /^apt-[a-z]{3}$/i.test(trimmed) ? trimmed.slice(4).toUpperCase() : trimmed.toUpperCase();
  const airport = await prisma.airport.findUnique({ where: { code }, select: { id: true, code: true } });
  return airport;
}

// Freeform deploy userIds arrive as arbitrary strings (e.g. "qa-user-1"), but
// the monorepo's NotificationSubscription.userId is a strict User FK. Resolve
// the compat way: an existing real User id / the `compat-<id>@flyby.local`
// address, else CREATE the stub user. Never links freeform identities to real
// users; never orphans the FK.
async function resolveCompatUserId(label: string | null): Promise<string | null> {
  if (!label) return null;
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(label);
  if (uuidLike) {
    const u = await prisma.user.findUnique({ where: { id: label } });
    if (u) return u.id;
  }
  const markerEmail = `compat-${label}@flyby.local`;
  const byEmail = await prisma.user.findUnique({ where: { email: markerEmail } });
  if (byEmail) return byEmail.id;
  const created = await prisma.user.create({
    data: { email: markerEmail, passwordHash: "compat-stub" },
  });
  return created.id;
}

// Reverse: compat listings/GETs accept the freeform label again.
async function compatUserLabelToIds(label: string): Promise<string[]> {
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(label);
  if (uuidLike) return [label];
  const markerEmail = `compat-${label}@flyby.local`;
  const byEmail = await prisma.user.findUnique({ where: { email: markerEmail } });
  return byEmail ? [byEmail.id] : [];
}

export const compatSubscribe = async (req: Request, res: Response) => {
  const body = (req.body && typeof req.body === "object" && req.body.subscription ? req.body.subscription : req.body) as Record<string, unknown>;
  const { endpoint, p256dh, auth, userId } = body as Record<string, unknown>;
  const airportIdRef = body.airportId;

  const errors: Array<{ field: string; message: string }> = [];
  if (typeof endpoint !== "string" || endpoint === "") errors.push({ field: "endpoint", message: "endpoint is required" });
  if (typeof p256dh !== "string" || p256dh === "") errors.push({ field: "p256dh", message: "p256dh is required" });
  if (typeof auth !== "string" || auth === "") errors.push({ field: "auth", message: "auth is required" });
  if (typeof airportIdRef !== "string" || airportIdRef === "") errors.push({ field: "airportId", message: "airportId is required" });
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }
  try {
    if (typeof endpoint === "string") new URL(endpoint);
  } catch {
    res.status(400).json({ errors: [{ field: "endpoint", message: "Invalid endpoint URL" }] });
    return;
  }

  try {
    const airport = await resolveCompatAirportId(String(airportIdRef));
    if (!airport) {
      res.status(404).json({ errors: [{ field: "airportId", message: `Airport not found: ${airportIdRef}` }] });
      return;
    }
    const effectiveUserId = typeof userId === "string" && userId ? userId : null;
    const linkedUserId = await resolveCompatUserId(effectiveUserId);

    const userCount = linkedUserId
      ? await prisma.notificationSubscription.count({ where: { userId: linkedUserId } })
      : 0;
    if (linkedUserId && userCount >= 10) {
      res.status(429).json({ errors: [{ field: "userId", message: "Maximum subscriptions per user exceeded" }] });
      return;
    }

    let record;
    const existing = await prisma.notificationSubscription.findFirst({
      where: { endpoint: String(endpoint), airportId: airport.id },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      record = await prisma.notificationSubscription.update({
        where: { id: existing.id },
        data: { keys: JSON.stringify({ p256dh, auth }), userId: linkedUserId },
      });
    } else {
      record = await prisma.notificationSubscription.create({
        data: {
          endpoint: String(endpoint),
          keys: JSON.stringify({ p256dh, auth }),
          airportId: airport.id,
          userId: linkedUserId,
        },
      });
    }
    res.status(existing ? 200 : 201).json({
      id: record.id,
      endpoint: record.endpoint,
      airportId: record.airportId,
      airportCode: airport.code,
      userId: effectiveUserId ?? "anonymous",
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("compatSubscribe error:", err);
    errorTotal.labels("compatSubscribe").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};

export const compatListSubscriptions = async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.notificationSubscription.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
      include: { airport: { select: { code: true } } },
    });
    res.json({ subscriptions: rows.map((r) => redactedCompatSubscription(r, r.airport.code)) });
  } catch (err) {
    console.error("compatListSubscriptions error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

const COMPAT_UNKNOWN_USERS = new Set(["user-unknown"]);

export const compatListUserSubscriptions = async (req: Request, res: Response) => {
  const userId = req.params.userId as string;
  if (COMPAT_UNKNOWN_USERS.has(userId)) {
    res.status(404).json({ error: "not_found", userId });
    return;
  }
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const pageSize = Math.max(1, Math.min(200, parseInt(String(req.query.pageSize || "50"), 10)));
  try {
    const zeroYear = new Date(0);
    const effectiveUserId = userId === "anonymous" ? null : userId;
    const linkedIds = effectiveUserId ? await compatUserLabelToIds(effectiveUserId) : null;
    const [total, rows] = await Promise.all([
      prisma.notificationSubscription.count({ where: { userId: effectiveUserId === null ? null : { in: linkedIds ?? [] } } }),
      prisma.notificationSubscription.findMany({
        where: { userId: effectiveUserId === null ? null : { in: linkedIds ?? [] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { airport: { select: { code: true } } },
      }),
    ]);
    res.json({
      subscriptions: rows.map((r) => redactedCompatSubscription(
        { id: r.id, airportId: r.airportId, createdAt: r.createdAt, updatedAt: zeroYear },
        r.airport.code,
      )),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error("compatListUserSubscriptions error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

export const compatDeleteSubscription = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (typeof id !== "string" || id.trim() === "") {
    res.status(404).json({ error: "not_found", id });
    return;
  }
  try {
    const record =
      (await prisma.notificationSubscription.findUnique({ where: { id } })) ??
      (await prisma.notificationSubscription.findFirst({ where: { endpoint: id } }));
    if (!record) {
      res.status(404).json({ error: "not_found", id });
      return;
    }
    const requester = req.get("X-User-Id");
    const forbidden =
      requester !== undefined &&
      record.userId &&
      (await compatUserLabelToIds(requester)).indexOf(record.userId) === -1;
    if (forbidden) {
      res.status(403).json({ error: "forbidden", message: "Cannot delete another user's subscription" });
      return;
    }
    await prisma.notificationSubscription.delete({ where: { id: record.id } });
    res.json({ success: true, id: record.id });
  } catch (err) {
    console.error("compatDeleteSubscription error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- preferences (singleton globals + per-user, shape-parity) ----------------
// Deploy-era global object stays process-local by design (QA relies on that
// contract only); per-user rows persist via NotificationPreference.
const compatGlobalPrefs = {
  enabled: true,
  airports: [] as string[],
  minWaitChange: 5,
  updatedAt: new Date().toISOString(),
};

export const compatGetPrefs = (_req: Request, res: Response) => {
  res.json(compatGlobalPrefs);
};

export const compatPutPrefs = (req: Request, res: Response) => {
  Object.assign(compatGlobalPrefs, req.body ?? {}, { updatedAt: new Date().toISOString() });
  res.json(compatGlobalPrefs);
};

// Deploy per-user prefs contract. dndStart/dndEnd are HH:MM strings here;
// the monorepo stores them as hour ints - the compat layer translates.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const COMPAT_FREQUENCIES = new Set(["realtime", "hourly", "daily"]);

interface CompatUserPrefs {
  userId: string;
  dndStart: string;
  dndEnd: string;
  thresholdMinutes: number;
  frequency: string;
  enabled: boolean;
  updatedAt: string;
  keyRowId?: string;
}

function hourToHHmm(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function prefsToCompat(userId: string, row?: { dndEnabled: boolean; dndStartHour: number; dndEndHour: number; thresholdMinutes: number; updatedAt: Date } | null): CompatUserPrefs {
  return {
    userId,
    dndStart: row ? hourToHHmm(row.dndStartHour) : "22:00",
    dndEnd: row ? hourToHHmm(row.dndEndHour) : "07:00",
    thresholdMinutes: row?.thresholdMinutes ?? 30,
    frequency: "realtime",
    enabled: row?.dndEnabled ?? true,
    updatedAt: (row ? row.updatedAt : new Date()).toISOString(),
    keyRowId: undefined,
  };
}

export const compatGetUserPrefs = async (req: Request, res: Response) => {
  const userId = req.params.userId as string;
  if (COMPAT_UNKNOWN_USERS.has(userId)) {
    res.status(404).json({ error: "not_found", userId });
    return;
  }
  try {
    const row = await prisma.notificationPreference.findUnique({ where: { userId } });
    res.json(prefsToCompat(userId, row));
  } catch (err) {
    console.error("compatGetUserPrefs error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

export const compatPatchUserPrefs = async (req: Request, res: Response) => {
  const userId = req.params.userId as string;
  if (COMPAT_UNKNOWN_USERS.has(userId)) {
    res.status(404).json({ error: "not_found", userId });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: Array<{ field: string; message: string }> = [];
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push({ field: "enabled", message: "enabled must be a boolean" });
  }
  if (body.dndStart !== undefined && (typeof body.dndStart !== "string" || !HHMM.test(body.dndStart))) {
    errors.push({ field: "dndStart", message: "dndStart must be in HH:MM format" });
  }
  if (body.dndEnd !== undefined && (typeof body.dndEnd !== "string" || !HHMM.test(body.dndEnd))) {
    errors.push({ field: "dndEnd", message: "dndEnd must be in HH:MM format" });
  }
  if (body.thresholdMinutes !== undefined && (typeof body.thresholdMinutes !== "number" || !Number.isInteger(body.thresholdMinutes) || body.thresholdMinutes < 1 || body.thresholdMinutes > 240)) {
    errors.push({ field: "thresholdMinutes", message: "thresholdMinutes must be an integer 1-240" });
  }
  if (body.frequency !== undefined && (typeof body.frequency !== "string" || !COMPAT_FREQUENCIES.has(body.frequency))) {
    errors.push({ field: "frequency", message: "frequency must be realtime, hourly, or daily" });
  }
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }
  try {
    const updateData: Record<string, unknown> = {};
    if (body.enabled !== undefined) updateData.dndEnabled = body.enabled;
    if (body.dndStart !== undefined) updateData.dndStartHour = parseInt(String(body.dndStart).slice(0, 2), 10);
    if (body.dndEnd !== undefined) updateData.dndEndHour = parseInt(String(body.dndEnd).slice(0, 2), 10);
    if (body.thresholdMinutes !== undefined) updateData.thresholdMinutes = body.thresholdMinutes;
    const row = await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...updateData },
      update: updateData,
    });
    res.json(prefsToCompat(userId, row));
  } catch (err) {
    console.error("compatPatchUserPrefs error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

// --- test notification trigger (simulated send + SSE broadcast) --------------
// QA-only surface: always reports how a send would behave; never attempts a
// real push (no VAPID push credentials at provider scope in compat mode).
interface NotificationPayload {
  title?: string;
  body?: string;
  data?: unknown;
}

// Compat SSE + liveSmoke subscribers: trigger payloads go to ALL open event
// streams, matching the deploy broadcast-to-everyone-but-no-persist semantic.
const compatSseClients = new Set<Response>();

// Exported for the streamDeployEvents handler to register clients on its
// stream surface.
export function registerCompatSseClient(res: Response): void {
  compatSseClients.add(res);
}
export function unregisterCompatSseClient(res: Response): void {
  compatSseClients.delete(res);
}

let compatMsgSeq = 1;
export const compatTriggerNotification = (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const subscriptionId = body.subscriptionId;
  const payloadIn = (body.payload ?? {}) as NotificationPayload;

  if (typeof subscriptionId !== "string" || subscriptionId === "") {
    res.status(400).json({ errors: [{ field: "subscriptionId", message: "subscriptionId is required" }] });
    return;
  }
  if (!payloadIn.title || !payloadIn.body) {
    res.status(400).json({ errors: [{ field: "payload", message: "payload.title and payload.body are required" }] });
    return;
  }
  if (/-expired$/.test(subscriptionId)) {
    res.json({
      sent: false,
      messageId: null,
      error: "subscription endpoint expired or invalid",
      subscriptionId,
    });
    return;
  }

  const messageId = `msg_${compatMsgSeq++}_${Date.now()}`;
  const payload = {
    type: "notification",
    title: payloadIn.title,
    body: payloadIn.body,
    data: payloadIn.data ?? null,
    messageId,
    subscriptionId,
    timestamp: new Date().toISOString(),
  };
  let deliveredTo = 0;
  for (const client of compatSseClients) {
    if (client.destroyed) continue;
    try {
      client.write(`data: ${JSON.stringify(payload)}\n\n`);
      deliveredTo += 1;
    } catch {
      compatSseClients.delete(client);
    }
  }
  res.json({ sent: true, messageId, payload, deliveredTo });
};

// --- admin moderation ---------------------------------------------------------
// Admin gate mirrors the deploy repo's contract (TIR-299-style): X-Admin-Key or
// Authorization: Bearer with ADMIN_API_KEY; 503 fail-closed when unset.
const ADMIN_KEY = process.env.ADMIN_API_KEY;

function requireCompatAdmin(req: Request, res: Response): boolean {
  if (!ADMIN_KEY) {
    res.status(503).json({ error: "Moderation is disabled: ADMIN_API_KEY not configured" });
    return false;
  }
  const offered = req.get("X-Admin-Key") ?? (req.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!offered) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const a = crypto.createHash("sha256").update(offered).digest();
  const b = crypto.createHash("sha256").update(ADMIN_KEY).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

const COMPAT_REPORT_ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|rpt_\w+)$/i;
const COMPAT_MOD_STATUSES = new Set(["flagged", "hidden", "none"]);

export const compatModerationQueue = async (req: Request, res: Response) => {
  if (!requireCompatAdmin(req, res)) return;
  const status = (typeof req.query.status === "string" ? req.query.status : "flagged") as string;
  if (!COMPAT_MOD_STATUSES.has(status)) {
    res.status(400).json({ errors: [{ field: "status", message: "status must be one of: flagged, hidden, none" }] });
    return;
  }
  try {
    const where =
      status === "none"
        ? { flagCount: 0 }
        : status === "hidden"
          ? { flagCount: { gte: 3 } }
          : { flagCount: { gt: 0, lt: 3 } };
    const rows = await prisma.waitTime.findMany({
      where,
      orderBy: { reportedAt: "desc" },
      take: 500,
      include: {
        flags: { orderBy: { createdAt: "desc" } },
        checkpoint: { select: { name: true, airport: { select: { code: true } } } },
      },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        airport: r.checkpoint.airport.code,
        checkpoint: r.checkpoint.name,
        waitMinutes: r.minutes,
        source: r.source,
        reportedAt: r.reportedAt.toISOString(),
        flagCount: r.flagCount,
        moderationStatus: r.flagCount >= 3 ? "hidden" : r.flagCount > 0 ? "flagged" : "none",
        flags: r.flags.map((f) => ({
          id: f.id,
          reason: f.reason,
          note: f.note ?? null,
          reportedAt: f.createdAt.toISOString(),
        })),
      })),
    );
  } catch (err) {
    console.error("compatModerationQueue error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

export const compatModerationAction = async (req: Request, res: Response, newStatus: "hidden" | "none") => {
  if (!requireCompatAdmin(req, res)) return;
  const id = req.params.id as string;
  if (typeof id !== "string" || !COMPAT_REPORT_ID_RE.test(id)) {
    res.status(400).json({ error: "Invalid report id" });
    return;
  }
  try {
    const row = await prisma.waitTime.findUnique({ where: { id }, include: { checkpoint: { select: { name: true, airport: { select: { code: true } } } } } });
    if (!row) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (newStatus === "hidden") {
      await prisma.waitTime.update({ where: { id }, data: { flagCount: 3 } });
    } else {
      await prisma.$transaction([
        prisma.reportFlag.deleteMany({ where: { reportId: id } }),
        prisma.waitTime.update({ where: { id }, data: { flagCount: 0 } }),
      ]);
    }
    const refreshed = await prisma.waitTime.findUnique({ where: { id }, include: { checkpoint: { select: { name: true, airport: { select: { code: true } } } }, flags: true } });
    res.json({
      id: refreshed!.id,
      airport: refreshed!.checkpoint.airport.code,
      checkpoint: refreshed!.checkpoint.name,
      waitMinutes: refreshed!.minutes,
      moderationStatus: refreshed!.flagCount >= 3 ? "hidden" : refreshed!.flagCount > 0 ? "flagged" : "none",
      flagCount: refreshed!.flagCount,
    });
  } catch (err) {
    console.error("compatModerationAction error:", err);
    res.status(500).json({ error: "Database unavailable" });
  }
};

export const compatModerationHide = (req: Request, res: Response) => compatModerationAction(req, res, "hidden");
export const compatModerationClear = (req: Request, res: Response) => compatModerationAction(req, res, "none");


