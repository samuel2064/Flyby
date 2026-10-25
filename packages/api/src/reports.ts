import crypto from "node:crypto";
import { Request, Response } from "express";
import { prisma } from "./prisma";
import { errorTotal } from "./metrics";
import { validateUUID } from "./validation";
import { FLAG_HIDE_THRESHOLD } from "./waitTimeUtils";
import { invalidateWaitStatsCaches } from "./waitStatsRoutes";

// Admin key for the report-delete endpoint. Read per request (not at module
// load) so tests and runtime config changes can toggle it without a restart.
function configuredAdminKey(): string | null {
  const key = process.env.ADMIN_API_KEY;
  return typeof key === "string" && key.length > 0 ? key : null;
}

// Constant-time comparison over sha256 digests so key length does not leak
// through timingSafeEqual's throw-on-length-mismatch behavior.
function adminKeyMatches(provided: string, expected: string): boolean {
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

// Extract the admin key from either the canonical X-Admin-Key header or an
// Authorization: Bearer <key> header (so plain curl and API clients both work).
function extractAdminKey(req: Request): string | null {
  const xAdminKey = req.headers["x-admin-key"];
  if (typeof xAdminKey === "string" && xAdminKey.length > 0) {
    return xAdminKey;
  }
  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    const parts = authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer" && parts[1].length > 0) {
      return parts[1];
    }
  }
  return null;
}

// Audit log for every successful deletion: structured single JSON line so it
// is greppable in Render/CloudWatch-style log drains. Emitted after the delete
// commits — an audit line means the row is really gone.
function auditReportDeletion(
  req: Request,
  report: {
    id: string;
    checkpointId: string;
    minutes: number;
    source: string;
    reportType: string;
    reportedAt: Date;
  }
) {
  console.info(
    JSON.stringify({
      event: "report_deleted",
      timestamp: new Date().toISOString(),
      reportId: report.id,
      checkpointId: report.checkpointId,
      minutes: report.minutes,
      source: report.source,
      reportType: report.reportType,
      reportedAt: report.reportedAt.toISOString(),
      ip: req.ip ?? null,
    })
  );
}

// DELETE /api/reports/:id — admin-only removal of a wait-time report.
// Used for QA/test-record cleanup in production. Fail-closed: if no
// ADMIN_API_KEY is configured the endpoint is disabled (503) rather than open.
//
// Responses:
//   503 — ADMIN_API_KEY not configured (deletion disabled)
//   401 — missing or incorrect admin key
//   400 — invalid report id format
//   404 — well-formed id that does not exist (also for repeat deletes)
//   204 — deleted
// Allowed reasons for flagging a crowd report as abusive/inaccurate.
const FLAG_REASONS = new Set(["wrong_location", "inaccurate", "spam", "other"]);

// POST /api/reports/:id/flag — traveler flags a report as suspect.
// Body: { reason, note?, sessionId? }. Session id comes from the X-Session-Id
// header (same convention as report submission) unless passed in the body.
// One flag per session per report (409 on repeat). When the flag count
// reaches FLAG_HIDE_THRESHOLD the report is excluded from all wait math.
//
// Responses:
//   400 — invalid report id, missing/invalid reason, or note over 200 chars
//   404 — report does not exist
//   409 — this session already flagged this report
//   201 — { flagId, flagCount, excluded } (excluded = now hidden from math)
export const flagReport = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const idValidation = validateUUID(id);
  if (!idValidation.valid) {
    res.status(400).json({ error: idValidation.error });
    return;
  }

  const body = req.body ?? {};
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!FLAG_REASONS.has(reason)) {
    res.status(400).json({
      error: `Invalid reason. Must be one of: ${Array.from(FLAG_REASONS).join(", ")}`,
    });
    return;
  }
  const note = body.note;
  if (note !== undefined && (typeof note !== "string" || note.length > 200)) {
    res.status(400).json({ error: "note must be a string of at most 200 characters" });
    return;
  }

  const headerSession = req.headers["x-session-id"];
  const sessionId =
    (typeof body.sessionId === "string" && body.sessionId.length > 0 && body.sessionId) ||
    (typeof headerSession === "string" && headerSession.length > 0 && headerSession) ||
    null;
  if (!sessionId) {
    res.status(400).json({ error: "A session id is required (X-Session-Id header or body.sessionId)" });
    return;
  }

  try {
    const report = await prisma.waitTime.findUnique({ where: { id: idValidation.id } });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const existing = await prisma.reportFlag.findUnique({
      where: { reportId_sessionId: { reportId: report.id, sessionId } },
    });
    if (existing) {
      res.status(409).json({ error: "This session has already flagged this report" });
      return;
    }

    const [flag, updated] = await prisma.$transaction([
      prisma.reportFlag.create({
        data: { reportId: report.id, reason, note: note ?? null, sessionId },
      }),
      prisma.waitTime.update({
        where: { id: report.id },
        data: { flagCount: { increment: 1 } },
      }),
    ]);

    console.info(
      JSON.stringify({
        event: "report_flagged",
        timestamp: new Date().toISOString(),
        reportId: report.id,
        flagId: flag.id,
        reason,
        flagCount: updated.flagCount,
        excluded: updated.flagCount >= FLAG_HIDE_THRESHOLD,
        ip: req.ip ?? null,
      })
    );

    if (updated.flagCount >= FLAG_HIDE_THRESHOLD) {
      // Newly hidden report: reflect-moderation must not wait out the stats
      // cache TTL (mirrors the deploy repo's invalidator registry).
      invalidateWaitStatsCaches();
    }

    res.status(201).json({
      data: {
        flagId: flag.id,
        reportId: report.id,
        flagCount: updated.flagCount,
        excluded: updated.flagCount >= FLAG_HIDE_THRESHOLD,
      },
    });
  } catch (err) {
    console.error("flagReport error:", err);
    errorTotal.labels("flagReport").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};

// GET /api/reports/flagged — moderation queue: reports with at least one flag,
// worst first, with the individual flags attached.
// Protected with admin auth (X-Admin-Key or Authorization: Bearer <key>).
export const getFlaggedReports = async (req: Request, res: Response) => {
  const adminKey = configuredAdminKey();
  if (!adminKey) {
    res
      .status(503)
      .json({ error: "Moderation queue is disabled: ADMIN_API_KEY is not configured" });
    return;
  }

  const providedKey = extractAdminKey(req);
  if (!providedKey || !adminKeyMatches(providedKey, adminKey)) {
    res.status(401).json({ error: "Invalid or missing admin key" });
    return;
  }

  try {
    const flagged = await prisma.waitTime.findMany({
      where: { flagCount: { gt: 0 } },
      orderBy: [{ flagCount: "desc" }, { reportedAt: "desc" }],
      take: 100,
      include: {
        flags: { orderBy: { createdAt: "desc" } },
        checkpoint: {
          select: {
            id: true,
            code: true,
            name: true,
            airport: { select: { code: true, name: true } },
          },
        },
      },
    });

    const data = flagged.map((wt) => ({
      id: wt.id,
      checkpointId: wt.checkpointId,
      checkpointCode: wt.checkpoint.code,
      checkpointName: wt.checkpoint.name,
      airportCode: wt.checkpoint.airport.code,
      airportName: wt.checkpoint.airport.name,
      minutes: wt.minutes,
      source: wt.source,
      reportType: wt.reportType,
      reportedAt: wt.reportedAt.toISOString(),
      flagCount: wt.flagCount,
      excluded: wt.flagCount >= FLAG_HIDE_THRESHOLD,
      flags: wt.flags.map((f) => ({
        id: f.id,
        reason: f.reason,
        note: f.note,
        createdAt: f.createdAt.toISOString(),
      })),
    }));

    res.json({ data });
  } catch (err) {
    console.error("getFlaggedReports error:", err);
    errorTotal.labels("getFlaggedReports").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};

export const deleteReport = async (req: Request, res: Response) => {
  const adminKey = configuredAdminKey();
  if (!adminKey) {
    res
      .status(503)
      .json({ error: "Report deletion is disabled: ADMIN_API_KEY is not configured" });
    return;
  }

  const providedKey = extractAdminKey(req);
  if (!providedKey || !adminKeyMatches(providedKey, adminKey)) {
    res.status(401).json({ error: "Invalid or missing admin key" });
    return;
  }

  const id = req.params.id as string;
  const idValidation = validateUUID(id);
  if (!idValidation.valid) {
    res.status(400).json({ error: idValidation.error });
    return;
  }

  try {
    const report = await prisma.waitTime.findUnique({ where: { id: idValidation.id } });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    await prisma.waitTime.delete({ where: { id: report.id } });

    auditReportDeletion(req, report);

    res.status(204).send();
  } catch (err) {
    console.error("deleteReport error:", err);
    errorTotal.labels("deleteReport").inc();
    res.status(500).json({ error: "Database unavailable" });
  }
};
