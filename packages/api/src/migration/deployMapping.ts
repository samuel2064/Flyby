/**
 * Pure mapping functions for the deploy-repo -> monorepo data migration
 * (TIR-339 hard constraint #5: prod wait_time_reports must survive the
 * convergence with zero data loss).
 *
 * Deploy schema (samuel2064/Flyby, PostgreSQL):
 *   Airport     { id, iataCode, name, city, country, latitude, longitude, timezone, createdAt }
 *   Checkpoint  { id, airportId, terminal, name, latitude, longitude, active, createdAt }
 *   WaitReport  { id, checkpointId, minutes, source, reportType, sessionId, reportedAt, createdAt }
 *   ReportFlag  { id, reportId, reason, note, sessionId, createdAt }
 *
 * Monorepo schema (packages/api/prisma/schema*.prisma):
 *   Airport     { code, name, city, state, country, timezone, latitude?, longitude? }
 *   Checkpoint  { airportId, code (unique per airport), name, terminal? }
 *   WaitTime    { id, checkpointId, minutes, source, reportType, reportedAt, userId?, flagCount, createdAt }
 *   ReportFlag  { id, reportId, reason, note, sessionId (required), createdAt }
 *
 * Rules (never fabricate data):
 *   - Unknown enum values map to the closest safe default AND surface a warning
 *     string so the migration report counts them. Nothing is silently dropped.
 *   - A report whose source checkpoint cannot be resolved returns
 *     `checkpointId: null` and is skipped-and-counted by the CLI, never
 *     assigned to a guessed checkpoint.
 *   - Deploy row ids are preserved as monorepo ids, making re-runs idempotent
 *     (createMany skipDuplicates on the primary key).
 *   - Deploy sessionIds become deterministic compat User rows using the
 *     M1b mailbox convention (compat-<hash>@flyby.local) so attribution and
 *     per-identity rate limiting survive the move without inventing real users.
 */

import { createHash } from "node:crypto";

export type DeployWaitReportRow = {
  id: string;
  checkpointId: string;
  minutes: number;
  source: string | null;
  reportType: string | null;
  sessionId: string | null;
  reportedAt: Date;
  createdAt: Date;
};

export type DeployReportFlagRow = {
  id: string;
  reportId: string;
  reason: string | null;
  note: string | null;
  sessionId: string | null;
  createdAt: Date;
};

export type MonorepoSource = "crowd" | "pattern" | "official";
export type MonorepoReportType = "standard" | "precheck" | "clear";
export type MonorepoFlagReason = "wrong_location" | "inaccurate" | "spam" | "other";

export interface MappingResult<T> {
  value: T;
  warnings: string[];
}

/** Deploy WaitReport.source -> monorepo WaitTime.source. Unknown -> crowd (warned). */
export function mapDeploySource(source: string | null): MappingResult<MonorepoSource> {
  const warnings: string[] = [];
  switch (source) {
    case "user_report":
      return { value: "crowd", warnings };
    case "api_sync":
      return { value: "official", warnings };
    case "historical":
      return { value: "pattern", warnings };
    case "crowd":
    case "pattern":
    case "official":
      // Already monorepo-shaped (re-run against a partially converged DB).
      return { value: source, warnings };
    default:
      warnings.push(`unknown source "${source ?? "null"}" -> crowd`);
      return { value: "crowd", warnings };
  }
}

/** Deploy WaitReport.reportType -> monorepo WaitTime.reportType. Unknown/null -> standard (warned when unknown). */
export function mapDeployReportType(reportType: string | null): MappingResult<MonorepoReportType> {
  const warnings: string[] = [];
  switch (reportType) {
    case "clear":
      return { value: "clear", warnings };
    case "precheck":
      return { value: "precheck", warnings };
    case "wait_time":
    case "busy":
    case "standard":
    case null:
    case undefined:
      return { value: "standard", warnings };
    default:
      warnings.push(`unknown reportType "${reportType}" -> standard`);
      return { value: "standard", warnings };
  }
}

/** Deploy ReportFlag.reason -> monorepo ReportFlag.reason. Unknown/null -> other (warned when unknown). */
export function mapDeployFlagReason(reason: string | null): MappingResult<MonorepoFlagReason> {
  const warnings: string[] = [];
  switch (reason) {
    case "wrong_location":
    case "inaccurate":
    case "spam":
    case "other":
      return { value: reason, warnings };
    case "wrong_checkpoint":
      return { value: "wrong_location", warnings };
    default:
      warnings.push(`unknown flag reason "${reason ?? "null"}" -> other`);
      return { value: "other", warnings };
  }
}

/**
 * Derive a monorepo Checkpoint.code from a deploy checkpoint name.
 * Deterministic slug; uniquified against `takenCodes` with -2, -3, ... suffixes.
 * The M1 compat resolver matches checkpoints by NAME, so `code` only needs
 * per-airport uniqueness and stability across re-runs.
 */
export function deriveCheckpointCode(name: string, takenCodes: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "checkpoint";

  if (!takenCodes.has(base)) {
    takenCodes.add(base);
    return base;
  }
  let n = 2;
  while (takenCodes.has(`${base}-${n}`)) n += 1;
  const code = `${base}-${n}`;
  takenCodes.add(code);
  return code;
}

/** Deterministic compat email for a deploy sessionId (M1b mailbox convention). */
export function compatUserEmail(sessionId: string): string {
  const hash = createHash("sha1").update(sessionId).digest("hex").slice(0, 12);
  return `compat-${hash}@flyby.local`;
}

export interface MappedWaitTime {
  id: string;
  checkpointId: string | null;
  minutes: number;
  source: MonorepoSource;
  reportType: MonorepoReportType;
  reportedAt: Date;
  userId: string | null;
  flagCount: number;
  createdAt: Date;
}

/**
 * Map one deploy WaitReport row to a monorepo WaitTime insert shape.
 * `checkpointIdBySourceId` maps deploy Checkpoint.id -> monorepo Checkpoint.id.
 * `userIdBySession` maps deploy sessionId -> compat monorepo User.id (may be
 * sparse when --no-map-sessions or the compat-user cap was hit).
 * `flagCount` is precomputed by the CLI from the deploy ReportFlag rows.
 */
export function mapWaitReport(
  row: DeployWaitReportRow,
  checkpointIdBySourceId: Map<string, string>,
  userIdBySession: Map<string, string>,
  flagCount: number
): MappingResult<MappedWaitTime> {
  const warnings: string[] = [];
  const checkpointId = checkpointIdBySourceId.get(row.checkpointId) ?? null;
  if (checkpointId === null) {
    warnings.push(`checkpoint ${row.checkpointId} unresolved; report ${row.id} skipped`);
  }

  const source = mapDeploySource(row.source);
  const reportType = mapDeployReportType(row.reportType);
  warnings.push(...source.warnings, ...reportType.warnings);

  const userId = row.sessionId ? (userIdBySession.get(row.sessionId) ?? null) : null;

  return {
    value: {
      id: row.id,
      checkpointId,
      minutes: row.minutes,
      source: source.value,
      reportType: reportType.value,
      reportedAt: row.reportedAt,
      userId,
      flagCount,
      createdAt: row.createdAt,
    },
    warnings,
  };
}

export interface DeployAirportRow {
  id: string;
  iataCode: string;
  name: string;
  city: string;
  country: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}

export interface MappedAirport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}

/**
 * Map a deploy Airport row. Monorepo requires name/city/country/timezone
 * (deploy may have null country/timezone) -> rows with required nulls return
 * `null` plus a warning; the CLI skips-and-counts them, never invents data.
 */
export function mapDeployAirport(row: DeployAirportRow): MappingResult<MappedAirport | null> {
  const warnings: string[] = [];
  if (!row.iataCode || row.name == null || row.city == null) {
    warnings.push(`airport ${row.id} missing code/name/city; skipped`);
    return { value: null, warnings };
  }
  if (row.country == null || row.timezone == null) {
    warnings.push(`airport ${row.iataCode} missing country/timezone; skipped`);
    return { value: null, warnings };
  }
  return {
    value: {
      code: row.iataCode,
      name: row.name,
      city: row.city,
      country: row.country,
      timezone: row.timezone,
      latitude: row.latitude,
      longitude: row.longitude,
      createdAt: row.createdAt,
    },
    warnings,
  };
}

export interface MappedCheckpointCreate {
  id: string;
  airportId: string;
  code: string;
  name: string;
  terminal: string | null;
  createdAt: Date;
}

/** Build the create-shape for a NEW monorepo checkpoint from a deploy row. */
export function mapDeployCheckpointForCreate(
  row: { id: string; name: string; terminal: string | null; createdAt: Date },
  airportId: string,
  code: string
): MappedCheckpointCreate {
  return {
    id: row.id,
    airportId,
    code,
    name: row.name,
    terminal: row.terminal,
    createdAt: row.createdAt,
  };
}

export interface MappedReportFlag {
  reportId: string;
  reason: MonorepoFlagReason;
  note: string | null;
  sessionId: string;
  createdAt: Date;
}

/** Map one deploy ReportFlag row. Null sessionId becomes a stable placeholder. */
export function mapDeployReportFlag(row: DeployReportFlagRow): MappingResult<MappedReportFlag> {
  const warnings: string[] = [];
  const reason = mapDeployFlagReason(row.reason);
  warnings.push(...reason.warnings);
  return {
    value: {
      reportId: row.reportId,
      reason: reason.value,
      note: row.note,
      sessionId: row.sessionId ?? "migrated-deploy-session",
      createdAt: row.createdAt,
    },
    warnings,
  };
}
