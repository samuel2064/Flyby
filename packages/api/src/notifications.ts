import { Request, Response } from "express";
import { prisma } from "./prisma";
import { decodeToken } from "./auth";
import { VISIBLE_REPORT_WHERE } from "./waitTimeUtils";

// Lazy-load web-push only when needed so the test suite can mock it cleanly.
// Using dynamic `await import()` (not require) so Vitest's vi.mock factory
// reliably substitutes the module in tests.
type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
  generateVAPIDKeys: () => { publicKey: string; privateKey: string };
};
let _webPush: WebPushModule | null = null;
async function getWebPush(): Promise<WebPushModule> {
  if (!_webPush) {
    const mod = await import("web-push");
    // web-push is CommonJS: its callable exports live on the namespace's
    // `default` (module.exports), NOT as named namespace members. Reading
    // them off the real namespace yields undefined and any caller hangs or
    // crashes (found by the TIR-339 contract corpus probing
    // /api/vapid-public-key). The default lookup must be throw-safe: Vitest
    // mock namespaces (no default in the factory) THROW on reading a
    // missing export rather than returning undefined.
    let impl: WebPushModule;
    try {
      impl = (mod as unknown as { default?: WebPushModule }).default ?? (mod as unknown as WebPushModule);
    } catch {
      impl = mod as unknown as WebPushModule;
    }
    _webPush = {
      setVapidDetails: impl.setVapidDetails,
      sendNotification: impl.sendNotification as WebPushModule['sendNotification'],
      generateVAPIDKeys: impl.generateVAPIDKeys,
    };
  }
  return _webPush;
}

export const ALERT_THRESHOLD_MINUTES = 30;
export const ALERT_SPIKE_PERCENT = 100;
export const ALERT_SPIKE_WINDOW_MINUTES = 15;
/**
 * Per-subscriber notification rate-limit window (minutes). Used as the spec
 * default for the anonymous (no pref row) PWA subscriber path and as the
 * server-side default when an authenticated user's `NotificationPreference`
 * row is first auto-created. Travelers can tune this on the Profile page via
 * `NotificationPreference.rateLimitMinutes` (range 5-1440) — a lower value
 * gives more frequent alerts (down to a 5 min cool-off), a higher value gives
 * a "summary digest" cadence (up to a daily 24h window). Default 60 preserves
 * the original hard-coded behaviour byte-for-byte.
 */
export const ALERT_RATE_LIMIT_MINUTES = 60;
export const ALERT_DND_DEFAULT_START = 22;
export const ALERT_DND_DEFAULT_END = 6;
// Leave-now multiplier, stored as an integer percent: 150 means "alert when the
// current wait exceeds 1.5x the 24h historical average". Exposed as a
// per-user preference (NotificationPreference.leaveNowPercent) so travelers
// can tune how aggressively "leave now" alerts fire.
export const ALERT_LEAVE_NOW_PERCENT = 150;

export type AlertType = "threshold" | "spike" | "leave_now";

export interface AlertContext {
  airportId: string;
  checkpointId?: string;
  minutes: number;
  previousMinutes?: number | null;
  previousReportedAt?: Date | null;
  historicalAverage?: number | null;
}

export interface AlertDecision {
  shouldAlert: boolean;
  alertType: AlertType | null;
  suggestedDepartureMinutes: number | null;
  reason: string;
}

async function getOrCreateVapidKeys() {
  const existing = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY;
  if (existing) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY!,
      privateKey: process.env.VAPID_PRIVATE_KEY!,
    };
  }
  const { generateVAPIDKeys } = await getWebPush();
  const vapidKeys = generateVAPIDKeys();
  console.warn("No VAPID keys in env. Generated ephemeral keys — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production.");
  return vapidKeys;
}

/**
 * Determine if the current wait time at a checkpoint should trigger an alert.
 *
 * Threshold: alert when wait minutes > thresholdMinutes (default 30).
 * Spike: alert when wait minutes increased by more than spikePercent
 *        (default 100%) within spikeWindowMinutes (default 15).
 * Leave-now: recommend departure when the current wait exceeds the historical
 *            24h average by the user-tunable leaveNowPercent multiplier
 *            (default 150 = 1.5x). Surfaces a "leave now"
 *            suggestedDepartureMinutes so the traveler can plan arrival.
 *
 * Pure function — easy to unit test without a database.
 */
export function evaluateAlert(ctx: AlertContext, opts?: {
  thresholdMinutes?: number;
  spikePercent?: number;
  spikeWindowMinutes?: number;
  leaveNowPercent?: number;
}): AlertDecision {
  const threshold = opts?.thresholdMinutes ?? ALERT_THRESHOLD_MINUTES;
  const spikePct = opts?.spikePercent ?? ALERT_SPIKE_PERCENT;
  const spikeWindow = opts?.spikeWindowMinutes ?? ALERT_SPIKE_WINDOW_MINUTES;
  const leaveNowPct = opts?.leaveNowPercent ?? ALERT_LEAVE_NOW_PERCENT;

  const minutes = ctx.minutes;
  const prev = ctx.previousMinutes ?? null;
  const prevAt = ctx.previousReportedAt ?? null;
  const historical = ctx.historicalAverage ?? null;

  if (minutes <= 0) {
    return { shouldAlert: false, alertType: null, suggestedDepartureMinutes: null, reason: "no-current-wait" };
  }

  if (minutes > threshold) {
    return {
      shouldAlert: true,
      alertType: "threshold",
      suggestedDepartureMinutes: minutes + 15,
      reason: `wait-time-exceeds-threshold:${minutes}min>${threshold}min`,
    };
  }

  if (prev != null && prev > 0 && prevAt) {
    const ageMinutes = (Date.now() - new Date(prevAt).getTime()) / (1000 * 60);
    const increasePct = ((minutes - prev) / prev) * 100;
    if (ageMinutes <= spikeWindow && increasePct >= spikePct && minutes > prev) {
      return {
        shouldAlert: true,
        alertType: "spike",
        suggestedDepartureMinutes: minutes + 15,
        reason: `wait-time-spike:${increasePct.toFixed(0)}%>${spikePct}%${ageMinutes.toFixed(1)}min`,
      };
    }
  }

  // Leave-now: alert when current wait exceeds historicalAverage * (leaveNowPct/100).
  // leaveNowPct is an integer percent (150 = 1.5x); the previous hard-coded
  // constant 1.5 corresponds to leaveNowPercent=150, which remains the default.
  if (historical != null && historical > 0 && minutes > historical * (leaveNowPct / 100)) {
    const multiplier = leaveNowPct / 100;
    return {
      shouldAlert: true,
      alertType: "leave_now",
      suggestedDepartureMinutes: Math.max(0, Math.round(15 + historical * multiplier)),
      reason: `leave-now:current-${minutes}min>${leaveNowPct}%-historical-${historical}min`,
    };
  }

  return {
    shouldAlert: false,
    alertType: null,
    suggestedDepartureMinutes: null,
    reason: "no-alert-condition-met",
  };
}

/**
 * Respect Do Not Disturb hours.
 * Default DND window: 22:00–06:00. Handles wrap-around across midnight.
 * `now` defaults to real time but is parameterised for tests.
 */
export function isInDndWindow(now: Date, startHour: number = ALERT_DND_DEFAULT_START, endHour: number = ALERT_DND_DEFAULT_END): boolean {
  const hour = now.getHours();
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

interface SubscriptionWithAirport {
  id: string;
  endpoint: string;
  keys: string;
  airportId: string;
  userId: string | null;
  airport: { code: string; name: string; timezone: string };
}

/**
 * Build the JSON payload for a Web Push notification.
 */
export function buildNotificationPayload(
  airportCode: string,
  airportName: string,
  alertType: AlertType,
  minutes: number,
  suggestedDepartureMinutes: number | null,
  checkpointName?: string
): { title: string; body: string; icon: string; data: Record<string, unknown> } {
  const cpLabel = checkpointName ? ` (${checkpointName})` : "";
  const titles: Record<AlertType, string> = {
    threshold: `Long wait at ${airportCode}`,
    spike: `Wait time spiking at ${airportCode}`,
    leave_now: `Leave now for ${airportCode}`,
  };
  let body = `${airportName}${cpLabel}: ${minutes} min wait`;
  if (suggestedDepartureMinutes != null) {
    if (alertType === "leave_now") {
      body += `. Leave within ${suggestedDepartureMinutes} min to stay ahead of the line.`;
    } else {
      body += `. Allow ~${suggestedDepartureMinutes} min to clear the checkpoint.`;
    }
  }
  return {
    title: titles[alertType],
    body,
    icon: "/icon-192.png",
    data: { airportCode, alertType, minutes, url: `/airport/${airportCode.toLowerCase()}` },
  };
}

async function getPreference(userId: string | null) {
  if (!userId) {
    // Anonymous (logged-out PWA) subscribers have no settings UI to tune DND,
    // so we do NOT mute them by default — they opted into notifications by
    // enabling the toggle, and there is no preference row they could change.
    // DND is a user-facing configuration: it only applies once a logged-in
    // user has a preference row (created below with the spec defaults).
    return {
      dndEnabled: false,
      dndStartHour: ALERT_DND_DEFAULT_START,
      dndEndHour: ALERT_DND_DEFAULT_END,
      thresholdMinutes: ALERT_THRESHOLD_MINUTES,
      spikePercent: ALERT_SPIKE_PERCENT,
      leaveNowPercent: ALERT_LEAVE_NOW_PERCENT,
      rateLimitMinutes: ALERT_RATE_LIMIT_MINUTES,
    };
  }
  const pref = await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      dndEnabled: true,
      dndStartHour: ALERT_DND_DEFAULT_START,
      dndEndHour: ALERT_DND_DEFAULT_END,
      thresholdMinutes: ALERT_THRESHOLD_MINUTES,
      spikePercent: ALERT_SPIKE_PERCENT,
      leaveNowPercent: ALERT_LEAVE_NOW_PERCENT,
      rateLimitMinutes: ALERT_RATE_LIMIT_MINUTES,
    },
    update: {},
  });
  return pref;
}

/**
 * Validation for notification preference fields.
 *
 * Rules:
 *  - dndEnabled      : boolean
 *  - dndStartHour    : integer 0-23 (inclusive)
 *  - dndEndHour      : integer 0-23 (inclusive). start===end disables DND
 *                     (treated as inactive window). start>end is allowed and
 *                     means the DND window wraps past midnight (e.g. 22→6).
 *  - thresholdMinutes: integer 1-120 — alert when wait time strictly exceeds.
 *  - spikePercent    : integer 1-500 — % increase over previous report.
 *  - leaveNowPercent : integer 100-300 — multiplier over the 24h historical
 *                     average that triggers a "leave now" alert, expressed
 *                     as a percent (150 = 1.5x; higher = less sensitive).
 *  - rateLimitMinutes: integer 5-1440 — minimum minutes between notifications
 *                     to the same subscriber for the same airport. Lower = more
 *                     frequent alerts (down to 5 min); higher = quieter (up to
 *                     24h, a daily digest). Default 60 preserves the original
 *                     global cap.
 *
 * Returns a list of human-readable validation errors; empty list when valid.
 */
export function validatePreferenceFields(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    errors.push("body must be an object");
    return errors;
  }
  const body = input as Record<string, unknown>;

  if ("dndEnabled" in body && typeof body.dndEnabled !== "boolean") {
    errors.push("dndEnabled must be a boolean");
  }
  for (const key of ["dndStartHour", "dndEndHour", "thresholdMinutes", "spikePercent", "leaveNowPercent", "rateLimitMinutes"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (typeof v !== "number" || !Number.isInteger(v)) {
      errors.push(`${key} must be an integer`);
      continue;
    }
    if (key === "dndStartHour" || key === "dndEndHour") {
      if (v < 0 || v > 23) errors.push(`${key} must be between 0 and 23`);
    } else if (key === "thresholdMinutes") {
      if (v < 1 || v > 120) errors.push("thresholdMinutes must be between 1 and 120");
    } else if (key === "spikePercent") {
      if (v < 1 || v > 500) errors.push("spikePercent must be between 1 and 500");
    } else if (key === "leaveNowPercent") {
      if (v < 100 || v > 300) errors.push("leaveNowPercent must be between 100 and 300");
    } else if (key === "rateLimitMinutes") {
      if (v < 5 || v > 1440) errors.push("rateLimitMinutes must be between 5 and 1440");
    }
  }
  return errors;
}

/**
 * Resolve the user id from a Bearer token; respond 401 if missing/invalid.
 * Returns null when no authenticated user could be established.
 */
function requireAuth(req: Request, res: Response): string | null {
  const token = req.headers.authorization?.replace("Bearer ", "") ?? null;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const dec = decodeToken(token);
  const userId = typeof dec?.sub === "string" ? dec.sub : null;
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  return userId;
}

/**
 * GET /api/notifications/preferences
 *
 * Returns the authenticated user's notification preferences. Auto-creates a
 * row with spec defaults when one does not yet exist (idempotent get-or-create).
 *
 * Response:
 *   200 { data: { dndEnabled, dndStartHour, dndEndHour, thresholdMinutes, spikePercent, leaveNowPercent, rateLimitMinutes } }
 *   401 Not authenticated
 */
export async function getPreferences(req: Request, res: Response) {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const pref = await getPreference(userId);
  res.json({
    data: {
      dndEnabled: pref.dndEnabled,
      dndStartHour: pref.dndStartHour,
      dndEndHour: pref.dndEndHour,
      thresholdMinutes: pref.thresholdMinutes,
      spikePercent: pref.spikePercent,
      leaveNowPercent: pref.leaveNowPercent,
      rateLimitMinutes: pref.rateLimitMinutes,
    },
  });
}

/**
 * PATCH /api/notifications/preferences
 *
 * Partially update the authenticated user's notification preferences. Only the
 * provided fields are touched; others retain their existing values.
 *
 * Request body (any subset):
 *   { dndEnabled?, dndStartHour?, dndEndHour?, thresholdMinutes?, spikePercent?, leaveNowPercent?, rateLimitMinutes? }
 *
 * Response:
 *   200 { data: { ...updated prefs } }
 *   400 Validation error (with list of failures)
 *   401 Not authenticated
 */
export async function updatePreferences(req: Request, res: Response) {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const errors = validatePreferenceFields(req.body);
  if (errors.length > 0) {
    res.status(400).json({ error: "Invalid preferences", details: errors });
    return;
  }

  // Load existing (auto-create defaults if absent) so PATCH can do a real
  // partial update rather than overwriting unset fields with defaults.
  const existing = await getPreference(userId);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.dndEnabled === "boolean") data.dndEnabled = body.dndEnabled;
  if (typeof body.dndStartHour === "number") data.dndStartHour = body.dndStartHour;
  if (typeof body.dndEndHour === "number") data.dndEndHour = body.dndEndHour;
  if (typeof body.thresholdMinutes === "number") data.thresholdMinutes = body.thresholdMinutes;
  if (typeof body.spikePercent === "number") data.spikePercent = body.spikePercent;
  if (typeof body.leaveNowPercent === "number") data.leaveNowPercent = body.leaveNowPercent;
  if (typeof body.rateLimitMinutes === "number") data.rateLimitMinutes = body.rateLimitMinutes;

  const updated = await prisma.notificationPreference.upsert({
    where: { userId },
    // existing.id exists (we just created it via getPreference); update only
    // the supplied fields.
    update: data,
    create: {
      userId,
      dndEnabled: typeof data.dndEnabled === "boolean" ? data.dndEnabled : existing.dndEnabled,
      dndStartHour: typeof data.dndStartHour === "number" ? data.dndStartHour : existing.dndStartHour,
      dndEndHour: typeof data.dndEndHour === "number" ? data.dndEndHour : existing.dndEndHour,
      thresholdMinutes: typeof data.thresholdMinutes === "number" ? data.thresholdMinutes : existing.thresholdMinutes,
      spikePercent: typeof data.spikePercent === "number" ? data.spikePercent : existing.spikePercent,
      leaveNowPercent: typeof data.leaveNowPercent === "number" ? data.leaveNowPercent : existing.leaveNowPercent,
      rateLimitMinutes: typeof data.rateLimitMinutes === "number" ? data.rateLimitMinutes : existing.rateLimitMinutes,
    },
  });

  res.json({
    data: {
      dndEnabled: updated.dndEnabled,
      dndStartHour: updated.dndStartHour,
      dndEndHour: updated.dndEndHour,
      thresholdMinutes: updated.thresholdMinutes,
      spikePercent: updated.spikePercent,
      leaveNowPercent: updated.leaveNowPercent,
      rateLimitMinutes: updated.rateLimitMinutes,
    },
  });
}

export async function getVapidPublicKey(_req: Request, res: Response) {
  const { publicKey } = await getOrCreateVapidKeys();
  res.json({ publicKey });
}

export async function subscribe(req: Request, res: Response) {
  const { endpoint, keys, airportId } = req.body;

  if (!endpoint || !keys || !airportId) {
    res.status(400).json({ error: "Missing required fields: endpoint, keys, airportId" });
    return;
  }

  if (!keys.p256dh || !keys.auth) {
    res.status(400).json({ error: "keys must include p256dh and auth" });
    return;
  }

  const airport = await prisma.airport.findUnique({ where: { id: airportId } });
  if (!airport) {
    res.status(404).json({ error: "Airport not found" });
    return;
  }

  const token = req.headers.authorization?.replace("Bearer ", "") ?? null;
  let userId: string | null = null;
  if (token) {
    const dec = decodeToken(token);
    userId = typeof dec?.sub === "string" ? dec.sub : null;
  }

  const subscription = await prisma.notificationSubscription.create({
    data: {
      endpoint,
      keys: JSON.stringify(keys),
      airportId,
      userId: userId ?? undefined,
    },
  });

  res.status(201).json({ data: { id: subscription.id, airportId, createdAt: subscription.createdAt } });
}

export async function unsubscribe(req: Request, res: Response) {
  const id = req.params.id as string;

  const subscription = await prisma.notificationSubscription.findUnique({ where: { id } });
  if (!subscription) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : null;
  if (token) {
    const dec = decodeToken(token);
    const userId = typeof dec?.sub === "string" ? dec.sub : null;
    if (subscription.userId && subscription.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  } else if (subscription.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  await prisma.notificationSubscription.delete({ where: { id } });
  res.json({ data: { id } });
}

export async function getSubscriptions(req: Request, res: Response) {
  const token = req.headers.authorization?.replace("Bearer ", "") ?? null;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const dec = decodeToken(token);
  const userId = typeof dec?.sub === "string" ? dec.sub : null;
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const subscriptions = await prisma.notificationSubscription.findMany({
    where: { userId },
    include: { airport: { select: { code: true, name: true } } },
  });

  res.json({
    data: subscriptions.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      airportId: s.airportId,
      airportCode: s.airport.code,
      airportName: s.airport.name,
      createdAt: s.createdAt,
    })),
  });
}

export interface DispatchResult {
  sent: number;
  skipped: number;
  reasons: string[];
  decision: AlertDecision;
  alertType: AlertType;
  suggestedDepartureMinutes: number | null;
}

export interface DispatchOptions {
  airportId: string;
  checkpointId?: string;
  minutes: number;
  force?: boolean;
  /**
   * For the auto-trigger fired by `reportWaitTime`: the timestamp of the
   * just-created WaitTime. We look for the *previous* report by querying
   * `reportedAt < currentReportedAt`, so the spike computation uses the report
   * prior to the new one rather than the new report itself. When omitted (the
   * HTTP `send` endpoint, or any caller that doesn't have a current report),
   * we use `reportedAt < now` as before.
   */
  currentReportedAt?: Date;
}

/**
 * Core alert dispatch used by both the HTTP `POST /api/notifications/send`
 * endpoint and the auto-trigger wired into `reportWaitTime`. Evaluates alert
 * conditions for an airport/checkpoint and dispatches a Web Push notification
 * to every subscriber, subject to:
 *  - Per-subscriber alert evaluation — each subscriber's
 *    `NotificationPreference.thresholdMinutes`, `spikePercent`, and
 *    `leaveNowPercent` re-evaluate `evaluateAlert` so the user-tunable sliders
 *    on the Profile page actually change the alerts they receive. Anonymous
 *    subscribers fall back to spec defaults.
 *  - Do Not Disturb hours (per-subscriber preference, default 22:00–06:00)
 *  - Max 1 notification per airport per subscriber per `rateLimitMinutes`
 *    (per-subscriber preference, default 60 min — preserves the original
 *    global ALERT_RATE_LIMIT_MINUTES cap; travelers can tune the cadence from
 *    5 min to a 24h daily digest on the Profile page)
 *  - Threshold / spike / leave-now logic (see evaluateAlert)
 *
 * The `decision`, `alertType`, and `suggestedDepartureMinutes` echoed on the
 * returned DispatchResult are the *baseline* decision (spec defaults), for
 * backward compatibility with operator callers expecting a single summary.
 * Per-subscriber outcomes (which alertType was actually sent, if any) are
 * reflected in the NotificationLog rows written per-subscriber, and the
 * `reasons` array surfaces per-subscriber eval-skip / dnd / rate-limited /
 * send-failed entries for observability.
 *
 * Returns a structured result; never throws — send failures are recorded in
 * `reasons` and counted in `skipped` so a notification outage can never break
 * the report-submission path that calls it.
 */
export async function dispatchWaitTimeAlerts(opts: DispatchOptions): Promise<DispatchResult> {
  const { airportId, checkpointId, minutes, force } = opts;

  const airport = await prisma.airport.findUnique({ where: { id: airportId } });
  if (!airport) {
    return {
      sent: 0,
      skipped: 0,
      reasons: ["airport-not-found"],
      decision: { shouldAlert: false, alertType: null, suggestedDepartureMinutes: null, reason: "airport-not-found" },
      alertType: "threshold",
      suggestedDepartureMinutes: null,
    };
  }

  let checkpoint: { id: string; name: string } | null = null;
  if (checkpointId) {
    checkpoint = await prisma.checkpoint.findUnique({
      where: { id: checkpointId },
      select: { id: true, name: true },
    });
    if (!checkpoint) {
      return {
        sent: 0,
        skipped: 0,
        reasons: ["checkpoint-not-found"],
        decision: { shouldAlert: false, alertType: null, suggestedDepartureMinutes: null, reason: "checkpoint-not-found" },
        alertType: "threshold",
        suggestedDepartureMinutes: null,
      };
    }
  }

  // Reference timestamp for "previous report" lookups. For the auto-trigger we
  // anchor on the just-created report's reportedAt so we don't match it back.
  const priorCutoff = opts.currentReportedAt ?? new Date();

  // Pull the most recent prior wait time (strictly before the current report)
  const recentWait = checkpointId
    ? await prisma.waitTime.findFirst({
        where: {
          checkpointId,
          reportedAt: { lt: priorCutoff },
          ...VISIBLE_REPORT_WHERE,
        },
        orderBy: { reportedAt: "desc" },
      })
    : null;

  // Historical average for the checkpoint (last 24h) — used for leave-now.
  // Exclude the just-created report itself when currentReportedAt is given so
  // the average reflects the state *before* the new report landed.
  let historicalAverage: number | null = null;
  if (checkpointId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.waitTime.findMany({
      where: {
        checkpointId,
        reportedAt: { gte: since, lt: priorCutoff },
        ...VISIBLE_REPORT_WHERE,
      },
      select: { minutes: true },
    });
    if (rows.length > 0) {
      historicalAverage = Math.round(rows.reduce((sum, r) => sum + r.minutes, 0) / rows.length);
    }
  }

  // Canonical decision computed against the global defaults. This is the
  // `decision` echoed back in the DispatchResult for backward compatibility
  // (callers of POST /api/notifications/send rely on a single decision
  // summary). Per-subscriber decisions are derived inside the loop using
  // each subscriber's own thresholdMinutes/spikePercent/leaveNowPercent so
  // their preference sliders actually change the alerts they receive.
  const baselineDecision = evaluateAlert({
    airportId,
    checkpointId: checkpointId ?? undefined,
    minutes,
    previousMinutes: recentWait?.minutes ?? null,
    previousReportedAt: recentWait?.reportedAt ?? null,
    historicalAverage,
  });

  if (!baselineDecision.shouldAlert && !force) {
    return {
      sent: 0,
      skipped: 1,
      reasons: [baselineDecision.reason],
      decision: baselineDecision,
      alertType: "threshold",
      suggestedDepartureMinutes: null,
    };
  }

  const webPush = await getWebPush();
  if (!webPush) {
    return {
      sent: 0,
      skipped: 0,
      reasons: ["web-push-unavailable"],
      decision: baselineDecision,
      alertType: "threshold",
      suggestedDepartureMinutes: null,
    };
  }
  const { publicKey, privateKey } = await getOrCreateVapidKeys();
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:ops@flyby.app",
    publicKey,
    privateKey
  );

  const subscriptions: SubscriptionWithAirport[] = await prisma.notificationSubscription.findMany({
    where: { airportId },
    include: { airport: { select: { code: true, name: true, timezone: true } } },
  });

  const now = new Date();
  const reasons: string[] = [];
  let sent = 0;
  let skipped = 0;

  for (const sub of subscriptions) {
    const pref = await getPreference(sub.userId);

    // Re-evaluate the alert against this subscriber's own thresholds. The
    // previous report / historical averages are checkpoint-level facts and
    // stay constant across subscribers; only thresholdMinutes/spikePercent/
    // leaveNowPercent (and the implicit spike-window constant) come from the
    // user's prefs. Anonymous subscribers (no pref row) get the spec defaults
    // via getPreference() — matching evaluateAlert's behaviour.
    const subDecision = evaluateAlert(
      {
        airportId,
        checkpointId: checkpointId ?? undefined,
        minutes,
        previousMinutes: recentWait?.minutes ?? null,
        previousReportedAt: recentWait?.reportedAt ?? null,
        historicalAverage,
      },
      {
        thresholdMinutes: pref.thresholdMinutes,
        spikePercent: pref.spikePercent,
        leaveNowPercent: pref.leaveNowPercent,
      }
    );

    // Skip subscribers whose own threshold says "don't alert" unless force
    // (operator override) is set. We record the per-subscriber reason for
    // observability so the dispatcher can explain why a given subscription
    // did not receive a push.
    if (!subDecision.shouldAlert && !force) {
      skipped += 1;
      reasons.push(`eval-skip:${sub.id}:${subDecision.reason}`);
      continue;
    }

    // DND check (skipped when force=true)
    if (!force && pref.dndEnabled && isInDndWindow(now, pref.dndStartHour, pref.dndEndHour)) {
      skipped += 1;
      reasons.push(`dnd:${sub.id}`);
      continue;
    }

    // Rate limit check: max 1 notification per `pref.rateLimitMinutes` window
    // per subscription/airport. This is the per-subscriber tunable cadence (the
    // Profile page exposes it as a 5-1440 minute slider); the spec-default 60
    // preserves the original global ALERT_RATE_LIMIT_MINUTES cap byte-for-byte.
    // Anonymous subscribers get ALERT_RATE_LIMIT_MINUTES (60) via
    // getPreference(null)'s default-shaped row — same as before.
    const cutoff = new Date(Date.now() - pref.rateLimitMinutes * 60 * 1000);
    const recentLog = await prisma.notificationLog.findFirst({
      where: { subscriptionId: sub.id, airportId, createdAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
    });
    if (recentLog && !force) {
      skipped += 1;
      reasons.push(`rate-limited:${sub.id}:${pref.rateLimitMinutes}m`);
      continue;
    }

    const effectiveAlertType: AlertType = subDecision.alertType ?? "threshold";

    const payload = buildNotificationPayload(
      sub.airport.code,
      sub.airport.name,
      effectiveAlertType,
      minutes,
      subDecision.suggestedDepartureMinutes,
      checkpoint?.name
    );

    try {
      const keys = JSON.parse(sub.keys);
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys,
        },
        JSON.stringify(payload)
      );
      await prisma.notificationLog.create({
        data: {
          subscriptionId: sub.id,
          airportId,
          checkpointId: checkpointId ?? null,
          alertType: effectiveAlertType,
          minutes,
        },
      });
      sent += 1;
    } catch (err) {
      // 410 Gone / 404 Not Found: subscription is dead — remove it
      let statusCode: number | undefined;
      if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        if (typeof e.statusCode === 'number') statusCode = e.statusCode;
        else if (typeof e.status === 'number') statusCode = e.status;
      }
      if (statusCode === 410 || statusCode === 404) {
        await prisma.notificationSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        reasons.push(`removed-stale:${sub.id}`);
      } else {
        reasons.push(`send-failed:${sub.id}:${statusCode ?? "error"}`);
      }
      skipped += 1;
    }
  }

  return {
    sent,
    skipped,
    reasons,
    decision: baselineDecision,
    alertType: baselineDecision.alertType ?? "threshold",
    suggestedDepartureMinutes: baselineDecision.suggestedDepartureMinutes,
  };
}

/**
 * POST /api/notifications/send
 *
 * Admin/operator endpoint that evaluates alert conditions for an airport and
 * dispatches a Web Push notification to every subscriber.
 *
 * Body:
 *   { airportId: string, checkpointId?: string, minutes: number, force?: boolean }
 * Response:
 *   200 { sent: number, skipped: number, reasons: string[], decision, alertType, suggestedDepartureMinutes }
 *
 * Also used internally by `reportWaitTime` via `dispatchWaitTimeAlerts` so
 * notifications fire automatically whenever a new crowd report crosses a
 * threshold or spike. Not intended to be called directly by travelers.
 */
export async function sendNotifications(req: Request, res: Response) {
  const { airportId, checkpointId, minutes, force } = req.body ?? {};

  if (!airportId || typeof minutes !== "number" || !Number.isFinite(minutes)) {
    res.status(400).json({ error: "Missing or invalid fields: airportId, minutes" });
    return;
  }
  if (minutes < 0) {
    res.status(400).json({ error: "minutes must be >= 0" });
    return;
  }

  const airport = await prisma.airport.findUnique({ where: { id: airportId } });
  if (!airport) {
    res.status(404).json({ error: "Airport not found" });
    return;
  }

  if (checkpointId) {
    const checkpoint = await prisma.checkpoint.findUnique({ where: { id: checkpointId } });
    if (!checkpoint) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
  }

  const result = await dispatchWaitTimeAlerts({ airportId, checkpointId, minutes, force });

  res.json({
    sent: result.sent,
    skipped: result.skipped,
    reasons: result.reasons,
    decision: result.decision,
    alertType: result.alertType,
    suggestedDepartureMinutes: result.suggestedDepartureMinutes,
  });
}
