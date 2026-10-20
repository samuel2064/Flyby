import { describe, it, expect } from "vitest";
import {
  migrateDeployData,
  type DeployCheckpointRow,
  type DeploySourceReader,
  type MigrationSink,
  type MigratableWaitTime,
} from "../src/migration/migrateDeployData";
import {
  compatUserEmail,
  type DeployAirportRow,
  type DeployReportFlagRow,
  type DeployWaitReportRow,
  type MappedAirport,
  type MappedCheckpointCreate,
  type MappedReportFlag,
} from "../src/migration/deployMapping";

/**
 * Orchestration tests for the deploy->monorepo data migration (TIR-339
 * condition 5). The I/O ports are driven with in-memory fixtures that mirror
 * the real adapters' key semantics (unique code for airports, preserved id
 * for checkpoints/reports, unique email for compat users, unique
 * reportId+sessionId for flags) so idempotency and skip-and-count behavior
 * are exercised end to end without a live database.
 */

function airport(overrides: Partial<DeployAirportRow> = {}): DeployAirportRow {
  return {
    id: "dapt_1",
    iataCode: "JFK",
    name: "John F. Kennedy International",
    city: "New York",
    country: "US",
    timezone: "America/New_York",
    latitude: 40.64,
    longitude: -73.78,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function checkpoint(overrides: Partial<DeployCheckpointRow> = {}): DeployCheckpointRow {
  return {
    id: "dckp_1",
    airportId: "dapt_1",
    terminal: "T4",
    name: "Terminal 4 Security",
    latitude: null,
    longitude: null,
    active: true,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function report(overrides: Partial<DeployWaitReportRow> = {}): DeployWaitReportRow {
  return {
    id: "wrpt_1",
    checkpointId: "dckp_1",
    minutes: 20,
    source: "user_report",
    reportType: "wait_time",
    sessionId: "sess_1",
    reportedAt: new Date("2026-10-01T10:00:00Z"),
    createdAt: new Date("2026-10-01T10:00:05Z"),
    ...overrides,
  };
}

function flag(overrides: Partial<DeployReportFlagRow> = {}): DeployReportFlagRow {
  return {
    id: "dflag_1",
    reportId: "wrpt_1",
    reason: "inaccurate",
    note: null,
    sessionId: "sess_2",
    createdAt: new Date("2026-10-02T00:00:00Z"),
    ...overrides,
  };
}

/** In-memory source: everything, optionally page-split for wait reports. */
function sourceFixture(
  airports: DeployAirportRow[],
  checkpoints: DeployCheckpointRow[],
  reports: DeployWaitReportRow[],
  flags: DeployReportFlagRow[],
  pageSize = 500,
): DeploySourceReader {
  return {
    async readAirports() {
      return airports;
    },
    async readCheckpoints() {
      return checkpoints;
    },
    async readWaitReports(afterId, limit) {
      const ordered = [...reports].sort((a, b) => a.id.localeCompare(b.id));
      if (afterId === null) return ordered.slice(0, Math.min(limit, pageSize));
      const idx = ordered.findIndex((r) => r.id > afterId);
      const start = idx === -1 ? ordered.length : idx;
      return ordered.slice(start, start + Math.min(limit, pageSize));
    },
    async readReportFlags() {
      return flags;
    },
  };
}

/** In-memory sink with the real adapters' unique-key semantics + call log. */
function sinkFixture() {
  const airportsById = new Map<string, MappedAirport & { monorepoId: string }>();
  const checkpointsById = new Map<string, MappedCheckpointCreate>();
  const usersByEmail = new Map<string, string>();
  const waitTimesById = new Map<string, MigratableWaitTime>();
  const flagKeys = new Set<string>();
  const insertedFlags: MappedReportFlag[] = [];
  const batchLog: Array<{ table: string; size: number }> = [];

  const sink: MigrationSink & { state: () => Record<string, number> } = {
    async upsertAirports(rows) {
      batchLog.push({ table: "airports", size: rows.length });
      const map = new Map<string, string>();
      for (const row of rows) {
        const existing = airportsById.get(row.code);
        if (!existing) airportsById.set(row.code, { ...row, monorepoId: `monorepo-apt-${row.code}` });
        map.set(row.code, airportsById.get(row.code)!.monorepoId);
      }
      return map;
    },
    async upsertCheckpoints(rows) {
      batchLog.push({ table: "checkpoints", size: rows.length });
      for (const row of rows) if (!checkpointsById.has(row.id)) checkpointsById.set(row.id, row);
    },
    async ensureCompatUsers(emails) {
      batchLog.push({ table: "users", size: emails.length });
      const map = new Map<string, string>();
      for (const email of emails) {
        if (!usersByEmail.has(email)) usersByEmail.set(email, `monorepo-user-${usersByEmail.size + 1}`);
        map.set(email, usersByEmail.get(email)!);
      }
      return map;
    },
    async insertWaitTimes(rows) {
      batchLog.push({ table: "waitTimes", size: rows.length });
      for (const row of rows) if (!waitTimesById.has(row.id)) waitTimesById.set(row.id, row);
    },
    async insertReportFlags(rows) {
      batchLog.push({ table: "reportFlags", size: rows.length });
      for (const row of rows) {
        const key = `${row.reportId}|${row.sessionId}`;
        if (!flagKeys.has(key)) {
          flagKeys.add(key);
          insertedFlags.push(row);
        }
      }
    },
    state() {
      return {
        airports: airportsById.size,
        checkpoints: checkpointsById.size,
        users: usersByEmail.size,
        waitTimes: waitTimesById.size,
        flags: insertedFlags.length,
      };
    },
  };
  return { sink, batchLog, waitTimesById, checkpointsById, usersByEmail };
}

describe("migrateDeployData orchestration", () => {
  it("migrates a full dataset preserving ids and deriving checkpoint codes", async () => {
    const reader = sourceFixture(
      [airport()],
      [checkpoint(), checkpoint({ id: "dckp_2", name: "Main Checkpoint" })],
      [
        report(),
        report({ id: "wrpt_2", checkpointId: "dckp_2", sessionId: "sess_1", source: "api_sync" }),
      ],
      [flag(), flag({ id: "dflag_2" })],
    );
    const fx = sinkFixture();
    const r = await migrateDeployData(reader, fx.sink);

    expect(r.airports).toEqual({ total: 1, migrated: 1, skipped: 0 });
    expect(r.checkpoints).toEqual({ total: 2, migrated: 2, skipped: 0 });
    expect(r.waitReports).toEqual({ total: 2, migrated: 2, skipped: 0 });
    expect(r.reportFlags).toEqual({ total: 2, migrated: 2, skipped: 0 });
    expect(r.compatUsers).toEqual({ sessions: 1 });
    expect(r.warnings).toEqual([]);

    // Preserved deploy ids + derived unique codes per airport.
    const codes = [...fx.checkpointsById.values()].map((c) => c.code).sort();
    expect(codes).toEqual(["main-checkpoint", "terminal-4-security"]);
    const stored = fx.waitTimesById.get("wrpt_1")!;
    expect(stored.checkpointId).toBe("dckp_1"); // preserved id
    expect(stored.source).toBe("crowd");
    expect(stored.flagCount).toBe(2); // two flags on wrpt_1
    expect(stored.userId).toBe(fx.usersByEmail.get(compatUserEmail("sess_1")));
  });

  it("skips and counts reports whose checkpoint belongs to a failed airport", async () => {
    const brokenAirport = airport({ id: "dapt_2", iataCode: "QQQ", country: null });
    const orphanCheckpoint = checkpoint({ id: "dckp_orphan", airportId: "dapt_2" });
    const reader = sourceFixture(
      [airport(), brokenAirport],
      [checkpoint(), orphanCheckpoint],
      [
        report(), // resolvable
        report({ id: "wrpt_orphan", checkpointId: "dckp_orphan" }), // airport skipped
        report({ id: "wrpt_ghost", checkpointId: "dckp_never_existed" }), // unknown checkpoint
      ],
      [],
    );
    const fx = sinkFixture();
    const r = await migrateDeployData(reader, fx.sink);

    expect(r.airports.skipped).toBe(1);
    expect(r.checkpoints.migrated).toBe(1);
    expect(r.checkpoints.skipped).toBe(1);
    expect(r.waitReports).toEqual({ total: 3, migrated: 1, skipped: 2 });
    expect(r.skippedUnresolvedCheckpoints).toBe(2);
    expect([...fx.waitTimesById.keys()]).toEqual(["wrpt_1"]);
    // The warnings include the skip reasons (never silent).
    expect(r.warnings.some((w) => w.message.includes("unresolved"))).toBe(true);
  });

  it("aggregates unknown enum values into counted warnings", async () => {
    const reader = sourceFixture(
      [airport()],
      [checkpoint()],
      [
        report({ id: "w1", source: "carrier_pigeon" }),
        report({ id: "w2", source: "carrier_pigeon", sessionId: null }),
        report({ id: "w3", source: "user_report", reportType: "chaos" }),
      ],
      [flag({ id: "f1", reason: "vibes" })],
    );
    const fx = sinkFixture();
    const r = await migrateDeployData(reader, fx.sink);

    const byMessage = new Map(r.warnings.map((w) => [w.message, w.count]));
    expect(byMessage.get('unknown source "carrier_pigeon" -> crowd')).toBe(2);
    expect(byMessage.get('unknown reportType "chaos" -> standard')).toBe(1);
    expect(byMessage.get('unknown flag reason "vibes" -> other')).toBe(1);
    // Null sessionId -> null userId, no compat user invented for it.
    expect(fx.waitTimesById.get("w2")!.userId).toBeNull();
    // Compat users come from REPORT sessions only (sess_1); flag sessions
    // stay plain strings on ReportFlag and never create users.
    expect(fx.usersByEmail.size).toBe(1);
  });

  it("handles paginated wait-report reads across multiple pages", async () => {
    const reports = Array.from({ length: 7 }, (_, i) =>
      report({ id: `wrpt_${String(i).padStart(2, "0")}`, sessionId: `sess_${i % 3}` }),
    );
    const reader = sourceFixture([airport()], [checkpoint()], reports, [], 3);
    const fx = sinkFixture();
    const r = await migrateDeployData(reader, fx.sink, { waitReportPageSize: 3 });

    expect(r.waitReports).toEqual({ total: 7, migrated: 7, skipped: 0 });
    expect(fx.waitTimesById.size).toBe(7);
    expect(fx.usersByEmail.size).toBe(3); // sess_0..sess_2 deduped
  });

  it("respects batchSize boundaries on sink writes", async () => {
    const reports = Array.from({ length: 5 }, (_, i) => report({ id: `wrpt_${i}` }));
    const reader = sourceFixture([airport()], [checkpoint()], reports, [], 500);
    const fx = sinkFixture();
    await migrateDeployData(reader, fx.sink, { batchSize: 2 });

    const wtBatches = fx.batchLog.filter((b) => b.table === "waitTimes").map((b) => b.size);
    expect(wtBatches).toEqual([2, 2, 1]);
  });

  it("is idempotent: a second full run writes nothing new and reports the same counts", async () => {
    const reader = sourceFixture(
      [airport(), airport({ id: "dapt_2", iataCode: "LAX", city: "Los Angeles" })],
      [checkpoint(), checkpoint({ id: "dckp_2", airportId: "dapt_2", name: "Main" })],
      [report(), report({ id: "wrpt_2", checkpointId: "dckp_2", sessionId: "sess_9" })],
      [flag()],
    );
    const fx = sinkFixture();

    const first = await migrateDeployData(reader, fx.sink);
    const snapshot = fx.sink.state();
    const second = await migrateDeployData(reader, fx.sink);

    expect(first.waitReports).toEqual({ total: 2, migrated: 2, skipped: 0 });
    expect(second.waitReports).toEqual(first.waitReports);
    expect(second.checkpoints).toEqual(first.checkpoints);
    expect(fx.sink.state()).toEqual(snapshot); // zero new rows on re-run
    expect(fx.usersByEmail.size).toBe(snapshot.users);
  });
});
