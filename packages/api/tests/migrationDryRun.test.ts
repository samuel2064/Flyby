import { describe, it, expect } from "vitest";
import { DryRunSink, migrateDeployData, type DeployCheckpointRow, type DeploySourceReader } from "../src/migration/migrateDeployData";
import type { DeployAirportRow, DeployReportFlagRow, DeployWaitReportRow } from "../src/migration/deployMapping";

/**
 * Dry-run projection tests (TIR-339 condition 5, `--dry-run` CLI mode).
 * The DryRunSink must produce byte-identical stage counts, warnings, and
 * per-airport parity data to a real sink run over the same fixtures - while
 * writing nothing - so launch-day previews against the deploy Postgres are
 * trustworthy.
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

function sourceFixture(
  airports: DeployAirportRow[],
  checkpoints: DeployCheckpointRow[],
  reports: DeployWaitReportRow[],
  flags: DeployReportFlagRow[],
): DeploySourceReader {
  return {
    async readAirports() {
      return airports;
    },
    async readCheckpoints() {
      return checkpoints;
    },
    async readWaitReports() {
      return reports;
    },
    async readReportFlags() {
      return flags;
    },
  };
}

/** In-memory sink mirroring the real adapters' unique-key id-return semantics. */
function recordingSink() {
  const written: Record<string, number> = { airports: 0, checkpoints: 0, users: 0, waitTimes: 0, reportFlags: 0 };
  const sink = {
    async upsertAirports(rows: Array<{ code: string }>) {
      written.airports += rows.length;
      return new Map(rows.map((r, i) => [r.code, `monorepo-apt-${i + 1}`]));
    },
    async upsertCheckpoints(rows: Array<{ id: string }>) {
      written.checkpoints += rows.length;
    },
    async ensureCompatUsers(emails: string[]) {
      written.users += emails.length;
      return new Map(emails.map((e, i) => [e, `monorepo-user-${i + 1}`]));
    },
    async insertWaitTimes(rows: Array<{ id: string }>) {
      written.waitTimes += rows.length;
    },
    async insertReportFlags(rows: Array<{ id: string }>) {
      written.reportFlags += rows.length;
    },
  };
  return { sink, written };
}

describe("DryRunSink", () => {
  it("synthesizes deterministic airport ids without writes", async () => {
    const sink = new DryRunSink();
    const ids = await sink.upsertAirports([
      { code: "JFK", name: "n", city: "c", country: "US", timezone: "tz", latitude: 1, longitude: 2 },
      { code: "LAX", name: "n", city: "c", country: "US", timezone: "tz", latitude: 1, longitude: 2 },
    ]);
    expect(ids.get("JFK")).toBe("dryrun-apt-JFK");
    expect(ids.get("LAX")).toBe("dryrun-apt-LAX");
  });

  it("synthesizes deterministic compat-user ids by position", async () => {
    const sink = new DryRunSink();
    const ids = await sink.ensureCompatUsers(["a@compat.invalid", "b@compat.invalid"]);
    expect(ids.get("a@compat.invalid")).toBe("dryrun-user-1");
    expect(ids.get("b@compat.invalid")).toBe("dryrun-user-2");
  });

  it("write methods resolve without error", async () => {
    const sink = new DryRunSink();
    await expect(sink.upsertCheckpoints([])).resolves.toBeUndefined();
    await expect(sink.insertWaitTimes([])).resolves.toBeUndefined();
    await expect(sink.insertReportFlags([])).resolves.toBeUndefined();
  });
});

describe("dry-run projection parity", () => {
  it("reports identical counts/warnings/perAirport as a real sink run and writes nothing", async () => {
    const airports = [airport(), airport({ id: "dapt_2", iataCode: "LAX", name: "Los Angeles International" })];
    const checkpoints = [
      checkpoint(),
      checkpoint({ id: "dckp_2", name: "Main Checkpoint" }),
      checkpoint({ id: "dckp_3", airportId: "dapt_2", name: "Terminal B" }),
    ];
    const reports = [
      report(),
      report({ id: "wrpt_2", checkpointId: "dckp_3", sessionId: "sess_2" }),
      report({ id: "wrpt_3", checkpointId: "dckp_2", sessionId: "sess_1", minutes: 35 }),
      // Unresolved checkpoint: counted as skipped, must not be attributed per-airport.
      report({ id: "wrpt_4", checkpointId: "dckp_missing", sessionId: "sess_1" }),
    ];
    const flags = [flag(), flag({ id: "dflag_2", reportId: "wrpt_2", sessionId: "sess_3" })];
    const reader = sourceFixture(airports, checkpoints, reports, flags);

    const { sink: realSink, written } = recordingSink();
    const realReport = await migrateDeployData(reader, realSink);
    expect(written.waitTimes).toBe(3);
    expect(written.reportFlags).toBe(2);
    expect(written.airports).toBe(2);

    const dryReport = await migrateDeployData(reader, new DryRunSink());
    // Everything except the sink identity field must match the real run.
    const strip = (r: object) => JSON.parse(JSON.stringify({ ...r, idempotentReRun: undefined }));
    expect(strip(dryReport)).toEqual(strip(realReport));

    // Stage counts on the shared dataset.
    expect(realReport.airports).toEqual({ total: 2, migrated: 2, skipped: 0 });
    expect(realReport.checkpoints).toEqual({ total: 3, migrated: 3, skipped: 0 });
    expect(realReport.waitReports).toEqual({ total: 4, migrated: 3, skipped: 1 });
    expect(realReport.skippedUnresolvedCheckpoints).toBe(1);

    // Per-airport parity: 2 reports to JFK (dckp_1, dckp_2), 1 to LAX.
    expect(realReport.perAirport).toEqual([
      { airportCode: "JFK", waitReports: 2 },
      { airportCode: "LAX", waitReports: 1 },
    ]);
  });

  it("projects a converged-target re-run as a fresh-target first run (documented semantics)", async () => {
    // On a real converged target every createMany skips on duplicates but the
    // report still counts attempted rows as migrated. The dry run is the
    // projection onto an EMPTY target, so it must show the same migrated
    // counts - that is the "what would a first run write" answer.
    const reader = sourceFixture(
      [airport()],
      [checkpoint()],
      [report(), report({ id: "wrpt_2", checkpointId: "dckp_1", sessionId: "sess_1" })],
      [],
    );
    const dryReport = await migrateDeployData(reader, new DryRunSink());
    expect(dryReport.airports.migrated).toBe(1);
    expect(dryReport.checkpoints.migrated).toBe(1);
    expect(dryReport.waitReports.migrated).toBe(2);
    expect(dryReport.reportFlags.migrated).toBe(0);
    expect(dryReport.perAirport).toEqual([{ airportCode: "JFK", waitReports: 2 }]);
  });

  it("keeps per-airport rows sorted by code and omits airports with zero migratable reports", async () => {
    const reader = sourceFixture(
      [airport({ id: "dapt_1", iataCode: "ZZZ" }), airport({ id: "dapt_2", iataCode: "AAA" })],
      [checkpoint({ id: "dckp_1", airportId: "dapt_1" }), checkpoint({ id: "dckp_2", airportId: "dapt_2", name: "Main" })],
      [report({ checkpointId: "dckp_1" })],
      [],
    );
    const dryReport = await migrateDeployData(reader, new DryRunSink());
    expect(dryReport.perAirport).toEqual([{ airportCode: "ZZZ", waitReports: 1 }]);
  });
});
