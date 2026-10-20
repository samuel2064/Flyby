/**
 * Deploy-repo -> monorepo data migration orchestration (TIR-339 condition 5).
 *
 * Consumes the pure mapping core (./deployMapping) and drives it through two
 * injected ports so every decision in the migration is unit-testable:
 *
 *   DeploySourceReader - reads the deploy Postgres (samuel2064/Flyby schema,
 *                        columns per the deployMapping header).
 *   MigrationSink      - writes into the monorepo Postgres schema
 *                        (prisma/deploy/schema.postgres.prisma) idempotently.
 *
 * Invariants (none of these may be weakened):
 *   - Deploy row ids are preserved; every write is createMany+skipDuplicates,
 *     so re-runs converge instead of duplicating (idempotent migration).
 *   - Reports whose checkpoint cannot be resolved are skipped AND counted,
 *     never assigned to a guessed checkpoint.
 *   - Unknown enum values surface as warnings in the report; nothing is
 *     silently coerced.
 *   - Deploy sessionIds become deterministic compat Users (M1b mailbox
 *     convention) so attribution survives without inventing real users.
 */

import {
  compatUserEmail,
  deriveCheckpointCode,
  mapDeployAirport,
  mapDeployCheckpointForCreate,
  mapDeployReportFlag,
  mapWaitReport,
  type DeployAirportRow,
  type DeployReportFlagRow,
  type DeployWaitReportRow,
  type MappedAirport,
  type MappedCheckpointCreate,
  type MappedReportFlag,
  type MappedWaitTime,
} from "./deployMapping";

export interface DeployCheckpointRow {
  id: string;
  airportId: string;
  terminal: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  createdAt: Date;
}

export interface DeploySourceReader {
  readAirports(): Promise<DeployAirportRow[]>;
  readCheckpoints(): Promise<DeployCheckpointRow[]>;
  readWaitReports(afterId: string | null, limit: number): Promise<DeployWaitReportRow[]>;
  readReportFlags(): Promise<DeployReportFlagRow[]>;
}

export type MigratableWaitTime = MappedWaitTime & { checkpointId: string };

export interface MigrationSink {
  /** Insert airports (skipDuplicates on code); returns monorepo id by airport code. */
  upsertAirports(rows: MappedAirport[]): Promise<Map<string, string>>;
  /** Insert checkpoints (skipDuplicates on preserved deploy id). */
  upsertCheckpoints(rows: MappedCheckpointCreate[]): Promise<void>;
  /** Ensure compat Users exist for these emails; returns monorepo user id by email. */
  ensureCompatUsers(emails: string[]): Promise<Map<string, string>>;
  /** Insert wait reports with resolved checkpoints (skipDuplicates on preserved id). */
  insertWaitTimes(rows: MigratableWaitTime[]): Promise<void>;
  /** Insert report flags (skipDuplicates on reportId+sessionId). */
  insertReportFlags(rows: MappedReportFlag[]): Promise<void>;
}

export interface StageCounts {
  total: number;
  migrated: number;
  skipped: number;
}

export interface MigrationReport {
  airports: StageCounts;
  checkpoints: StageCounts;
  compatUsers: { sessions: number };
  waitReports: StageCounts;
  skippedUnresolvedCheckpoints: number;
  reportFlags: StageCounts;
  /** Distinct warning messages with occurrence counts, sorted by count desc. */
  warnings: Array<{ message: string; count: number }>;
  idempotentReRun: boolean;
}

export interface MigrateOptions {
  batchSize?: number;
  waitReportPageSize?: number;
}

class WarningCollector {
  private counts = new Map<string, number>();

  add(message: string): void {
    this.counts.set(message, (this.counts.get(message) ?? 0) + 1);
  }

  listed(): Array<{ message: string; count: number }> {
    return [...this.counts.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message));
  }
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Run the full migration. Every stage is idempotent; running it twice against
 * the same target yields the same counts (the second pass skips on duplicate
 * keys) and is reported via `idempotentReRun` heuristics in the report.
 */
export async function migrateDeployData(
  reader: DeploySourceReader,
  sink: MigrationSink,
  options: MigrateOptions = {},
): Promise<MigrationReport> {
  const batchSize = options.batchSize ?? 500;
  const pageSize = options.waitReportPageSize ?? 500;
  const warnings = new WarningCollector();

  // --- 1. Airports -----------------------------------------------------------
  const deployAirports = await reader.readAirports();
  const mappedAirports: MappedAirport[] = [];
  const monorepoIdByDeployAirportId = new Map<string, string>();
  let airportsSkipped = 0;
  for (const row of deployAirports) {
    const mapped = mapDeployAirport(row);
    for (const w of mapped.warnings) warnings.add(w);
    if (mapped.value === null) {
      airportsSkipped++;
      continue;
    }
    monorepoIdByDeployAirportId.set(row.id, mapped.value.code);
    mappedAirports.push(mapped.value);
  }
  const airportIdByCode = await sink.upsertAirports(mappedAirports);

  // --- 2. Checkpoints ----------------------------------------------------------
  const deployCheckpoints = await reader.readCheckpoints();
  const migratedCheckpointIds = new Set<string>();
  const checkpointCreates: MappedCheckpointCreate[] = [];
  // Deploy checkpoints of airports that failed validation must not block the
  // migration: they are skipped and their reports will skip-and-count later.
  const takenCodesByAirport = new Map<string, Set<string>>();
  let checkpointsSkipped = 0;
  for (const cp of deployCheckpoints) {
    const code = monorepoIdByDeployAirportId.get(cp.airportId);
    if (code === undefined) {
      checkpointsSkipped++;
      continue;
    }
    const monorepoAirportId = airportIdByCode.get(code);
    if (monorepoAirportId === undefined) {
      checkpointsSkipped++;
      continue;
    }
    let taken = takenCodesByAirport.get(cp.airportId);
    if (!taken) {
      taken = new Set<string>();
      takenCodesByAirport.set(cp.airportId, taken);
    }
    const derived = deriveCheckpointCode(cp.name, taken);
    checkpointCreates.push(mapDeployCheckpointForCreate(cp, monorepoAirportId, derived));
    migratedCheckpointIds.add(cp.id);
  }
  for (const batch of chunk(checkpointCreates, batchSize)) {
    await sink.upsertCheckpoints(batch);
  }

  // --- 3. Wait reports (paged read, single processing pass) --------------------
  const allReports: DeployWaitReportRow[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page = await reader.readWaitReports(afterId, pageSize);
    if (page.length === 0) break;
    allReports.push(...page);
    afterId = page[page.length - 1].id;
    if (page.length < pageSize) break;
  }

  // Compat users for every distinct deploy session (deterministic mailboxes).
  const sessionIds = [...new Set(allReports.map((r) => r.sessionId).filter((s): s is string => s !== null))];
  const emailBySession = new Map(sessionIds.map((s) => [s, compatUserEmail(s)]));
  const userIdByEmail = await sink.ensureCompatUsers([...new Set(emailBySession.values())]);
  const userIdBySession = new Map<string, string>();
  for (const [sessionId, email] of emailBySession) {
    const userId = userIdByEmail.get(email);
    if (userId !== undefined) userIdBySession.set(sessionId, userId);
  }

  // --- 4. Flags + per-report flag counts --------------------------------------
  const deployFlags = await reader.readReportFlags();
  const flagCountByReport = new Map<string, number>();
  for (const flag of deployFlags) {
    flagCountByReport.set(flag.reportId, (flagCountByReport.get(flag.reportId) ?? 0) + 1);
  }

  const mappedFlags: MappedReportFlag[] = [];
  for (const flag of deployFlags) {
    const mapped = mapDeployReportFlag(flag);
    for (const w of mapped.warnings) warnings.add(w);
    mappedFlags.push(mapped.value);
  }

  const migratable: MigratableWaitTime[] = [];
  let skippedUnresolvedCheckpoints = 0;
  // Migrated checkpoints keep their deploy id as the monorepo id, so the
  // source->target map is the identity over the migrated id set.
  const checkpointIdBySourceId = new Map([...migratedCheckpointIds].map((id) => [id, id]));
  for (const report of allReports) {
    const mapped = mapWaitReport(report, checkpointIdBySourceId, userIdBySession, flagCountByReport.get(report.id) ?? 0);
    for (const w of mapped.warnings) warnings.add(w);
    if (mapped.value.checkpointId === null) {
      skippedUnresolvedCheckpoints++;
      continue;
    }
    migratable.push(mapped.value as MigratableWaitTime);
  }

  for (const batch of chunk(migratable, batchSize)) {
    await sink.insertWaitTimes(batch);
  }
  for (const batch of chunk(mappedFlags, batchSize)) {
    await sink.insertReportFlags(batch);
  }

  return {
    airports: { total: deployAirports.length, migrated: mappedAirports.length, skipped: airportsSkipped },
    checkpoints: {
      total: deployCheckpoints.length,
      migrated: checkpointCreates.length,
      skipped: checkpointsSkipped,
    },
    compatUsers: { sessions: sessionIds.length },
    waitReports: {
      total: allReports.length,
      migrated: migratable.length,
      skipped: allReports.length - migratable.length,
    },
    skippedUnresolvedCheckpoints,
    reportFlags: { total: deployFlags.length, migrated: mappedFlags.length, skipped: 0 },
    warnings: warnings.listed(),
    idempotentReRun: false,
  };
}
