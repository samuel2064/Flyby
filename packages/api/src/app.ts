import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { requestLogger, healthHandler, errorHandler, notFoundHandler, requestTimeout, cacheHeaders, securityHeaders, catchAsyncRoutes } from "./middleware";
import { metricsMiddleware, register } from "./metrics";
import { searchAirports, getAirportByCode } from "./airports";
import { 
  getCheckpoints, 
  reportWaitTime, 
  getCheckpointById, 
  getCheckpointHistory, 
  getCheckpointStats,
  getCheckpointPredict,
  getAirportForecasts,
  streamCheckpointWaitTimes,
  streamAllCheckpoints,
  getCheckpointsByAirportCode,
  streamAirportCheckpointsLive,
} from "./checkpoints";
import { deleteReport, flagReport, getFlaggedReports } from "./reports";
import { getMe, patchMe } from "./me";
import { getDashboard } from "./dashboard";
import { getAirportWaitStats, getWaitTimesSummary } from "./waitStatsRoutes";
import {
  getWaitTimesCompat,
  postWaitTimeCompat,
  streamDeployEvents,
  compatListAirports,
  compatGetAirportByCode,
  compatListCheckpointsByAirport,
  compatGetCheckpointHistory,
  compatSubscribe,
  compatListSubscriptions,
  compatListUserSubscriptions,
  compatDeleteSubscription,
  compatGetPrefs,
  compatPutPrefs,
  compatGetUserPrefs,
  compatPatchUserPrefs,
  compatTriggerNotification,
  compatModerationQueue,
  compatModerationHide,
  compatModerationClear,
} from "./deployCompat";
import { getVapidPublicKey, subscribe, unsubscribe, unsubscribeByEndpoint, getSubscriptions, sendNotifications, getPreferences, updatePreferences, requireAuth } from "./notifications";
import usersRouter from "./usersRouter";
import { getAgentsMe, getInboxLite } from "./agents";

// Inline session tracking and middleware
interface SessionData {
  id: string;
  createdAt: string;
  reportsSubmitted: number;
}

const sessions = new Map<string, SessionData>();

// Extend Express Request type
interface ExpressRequest extends Request {
  session?: SessionData;
}

function getOrCreateSession(req: ExpressRequest): SessionData {
  const header = req.headers['x-session-id'];
  let id: string;
  if (typeof header === 'string' && header.length > 0) {
    id = header;
  } else {
    id = 'anon-' + Math.random().toString(36).slice(2,10);
  }
  if (!sessions.has(id)) {
    sessions.set(id, { id, createdAt: new Date().toISOString(), reportsSubmitted: 0 });
  }
  req.session = sessions.get(id);
  return req.session!;
}

function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  getOrCreateSession(req);
  next();
}

const app = express();

// Every handler registered from here on (native, compat, late mounts) is
// promise-safe: sync throws and rejected promises reach errorHandler instead
// of hanging the request (Express 4 does not do this natively).
catchAsyncRoutes(app);

// Security headers via helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for now (would need adjustment for inline scripts)
    crossOriginEmbedderPolicy: false, // Required for some dev tools
  })
);

// Additional security headers middleware
app.use(securityHeaders);

// Request timeout (30s default for non-SSE routes)
app.use(requestTimeout(30000));

// CORS: allow any origin in development; restrict in production
const corsOptions = {
  credentials: true,
  origin:
    process.env.NODE_ENV === "production" && process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
      : true,
};
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(sessionMiddleware);

const limiter = rateLimit({ windowMs: 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// Request/response logging
app.use(requestLogger);

// Metrics tracking (skip for /metrics endpoint itself)
app.use(metricsMiddleware);

// Response cache headers for read endpoints
app.use(cacheHeaders);

// Health check (root + /api alias — the /api/health route is required by the
// docker-compose.yml and Dockerfile HEALTHCHECK directives)
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Airports
// TIR-339: bare list = deploy contract (full list, flat rows, apt-* ids).
// Search behavior with ?q= unchanged and handled by the same URL pattern.
app.get("/api/airports", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const geoSearch = req.query.lat !== undefined || req.query.lng !== undefined;
  if (q.length > 0 || geoSearch) {
    return searchAirports(req, res);
  }
  return compatListAirports(req, res);
});
app.get("/api/airports/search", searchAirports);
app.get("/api/airports/:code", getAirportByCode);
app.get("/api/airports/:code/forecasts", getAirportForecasts);

// Checkpoints
app.get("/api/checkpoints/stream", streamAllCheckpoints);
app.get("/api/checkpoints", getCheckpoints);
app.get("/api/checkpoints/airport/:code/live", streamAirportCheckpointsLive);
app.get("/api/checkpoints/airport/:code", getCheckpointsByAirportCode);
app.get("/api/checkpoints/:id", getCheckpointById);
app.get("/api/checkpoints/:id/history", getCheckpointHistory);
app.get("/api/checkpoints/:id/stats", getCheckpointStats);
app.get("/api/checkpoints/:id/predict", getCheckpointPredict);
app.post("/api/checkpoints/:id/wait-times", reportWaitTime);
app.get("/api/checkpoints/:id/stream", streamCheckpointWaitTimes);

// Reports (rate-limited reporting endpoint)
app.post("/api/reports", reportWaitTime);
// Abuse flagging: one flag per session; >=3 flags hides the report from math
app.get("/api/reports/flagged", getFlaggedReports);
app.post("/api/reports/:id/flag", flagReport);
// Admin-only deletion (QA test-record cleanup) — auth in handler
app.delete("/api/reports/:id", deleteReport);

// Dashboard
app.get("/api/dashboard", getDashboard);

// Deploy-compat surface (TIR-339/M1): the traveler-facing routes the live web
// app and QA probes call against flyby-api today, served identically from the
// monorepo. Read ALL available detail from the native matching handlers; these
// paths exist alongside them, not in place of them.
app.get("/api/wait-times", getWaitTimesCompat);
app.post("/api/wait-times", postWaitTimeCompat);
app.post("/api/wait-times/report", postWaitTimeCompat);
app.get("/api/events", streamDeployEvents);
app.get("/api/wait-times/stream", streamDeployEvents);
app.get("/api/sse", streamDeployEvents);

// Additional compat routes for catalog endpoints (mounted on /api/compat/ for
// M0 testing; M1 will evaluate standard-path mounting strategy per CEO gate).
app.get("/api/compat/airports/:code", compatGetAirportByCode);
app.get("/api/compat/checkpoints", compatListCheckpointsByAirport);
app.get("/api/compat/checkpoints/:id/history", compatGetCheckpointHistory);

// Dashboard aggregation endpoints (TIR-336): cross-airport summary +
// per-airport wait stats. Slug mirrors the deploy repo's contract so the
// dashboard's paths work unmodified on either backend.
app.get("/api/wait-times/summary", getWaitTimesSummary);
app.get("/api/airports/:code/wait-stats", getAirportWaitStats);

// --- QA/notifications ---

// Me
app.get("/api/me", getMe);
app.patch("/api/me", patchMe);

// Agents
app.get("/api/agents/me", getAgentsMe);
app.get("/api/agents/me/inbox-lite", getInboxLite);

// Auth
app.use("/v1/auth", usersRouter);

// Push notifications
app.get("/api/notifications/vapid-public-key", getVapidPublicKey);
app.post("/api/notifications/subscribe", subscribe);
// TIR-359: endpoint-scoped unsubscribe (authenticated) alongside delete-by-id.
app.delete("/api/notifications/subscribe", requireAuth, unsubscribeByEndpoint);
app.delete("/api/notifications/subscriptions/:id", unsubscribe);
app.get("/api/notifications/subscriptions", getSubscriptions);
app.get("/api/notifications/preferences", getPreferences);
app.patch("/api/notifications/preferences", updatePreferences);
app.post("/api/notifications/send", sendNotifications);

// QA-era compat aliases (TIR-339/M1b) - mounted AFTER native static routes so
// auth-gated native paths win where semantics collide. QA probes use the
// deployment-canonical aliases (same handler sets).
app.get("/api/push/vapid-public-key", getVapidPublicKey);
app.get("/api/push/vapidPublicKey", getVapidPublicKey);
app.get("/api/vapid-public-key", getVapidPublicKey);
app.post("/api/push/subscribe", (req, res) => void compatSubscribe(req, res));
app.post("/api/subscriptions", (req, res) => void compatSubscribe(req, res));
app.get("/api/push/subscriptions", compatListSubscriptions);
app.get("/api/subscriptions", compatListSubscriptions);
app.delete("/api/notifications/subscriptions/:id", compatDeleteSubscription);
app.delete("/api/push/subscriptions/:id", compatDeleteSubscription);
app.delete("/api/subscriptions/:id", compatDeleteSubscription);
app.patch("/api/notifications/preferences/:userId", compatPatchUserPrefs);
app.get("/api/notifications/preferences/:userId", compatGetUserPrefs);
app.get("/api/preferences", compatGetPrefs);
app.put("/api/preferences", compatPutPrefs);
app.get("/api/notifications/prefs", compatGetPrefs);
app.put("/api/notifications/prefs", compatPutPrefs);
app.get("/api/notifications/:userId", compatListUserSubscriptions);
app.post("/api/notifications/trigger", compatTriggerNotification);
app.post("/api/push/trigger", compatTriggerNotification);
app.post("/api/notifications/test", compatTriggerNotification);
app.get("/api/moderation/reports", compatModerationQueue);
app.post("/api/moderation/reports/:id/hide", compatModerationHide);
app.post("/api/moderation/reports/:id/clear", compatModerationClear);

// 404 handler for unmatched routes (must be last route)
app.use(notFoundHandler);

// Global error handler (must be last middleware)
app.use(errorHandler);

export default app;
