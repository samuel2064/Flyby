import { describe, it, expect } from "vitest";
import {
  mapDeploySource,
  mapDeployReportType,
  mapDeployFlagReason,
  deriveCheckpointCode,
  compatUserEmail,
  mapWaitReport,
  mapDeployAirport,
  mapDeployCheckpointForCreate,
  mapDeployReportFlag,
  type DeployWaitReportRow,
} from "../src/migration/deployMapping";

/**
 * Tests for the deploy-repo -> monorepo data-migration mapping core
 * (TIR-339 CEO condition 5: prod data survives the convergence, nothing
 * silently dropped or fabricated). The mapping module's doc header records
 * the verified deploy schema these fixtures mirror.
 */

function deployReport(overrides: Partial<DeployWaitReportRow> = {}): DeployWaitReportRow {
  return {
    id: "wtr_001",
    checkpointId: "ckp_001",
    minutes: 25,
    source: "user_report",
    reportType: "wait_time",
    sessionId: "sess_abc",
    reportedAt: new Date("2026-10-01T10:00:00Z"),
    createdAt: new Date("2026-10-01T10:00:05Z"),
    ...overrides,
  };
}

describe("mapDeploySource", () => {
  it("maps deploy enum values to monorepo equivalents", () => {
    expect(mapDeploySource("user_report")).toEqual({ value: "crowd", warnings: [] });
    expect(mapDeploySource("api_sync")).toEqual({ value: "official", warnings: [] });
    expect(mapDeploySource("historical")).toEqual({ value: "pattern", warnings: [] });
  });

  it("passes already-monorepo-shaped values through (re-run safety)", () => {
    for (const src of ["crowd", "pattern", "official"]) {
      const r = mapDeploySource(src);
      expect(r.value).toBe(src);
      expect(r.warnings).toEqual([]);
    }
  });

  it("unknown/null sources fall back to crowd WITH a warning (never silent)", () => {
    const unknown = mapDeploySource("telepathy");
    expect(unknown.value).toBe("crowd");
    expect(unknown.warnings).toHaveLength(1);
    expect(unknown.warnings[0]).toContain("telepathy");

    const nulled = mapDeploySource(null);
    expect(nulled.value).toBe("crowd");
    expect(nulled.warnings[0]).toContain("null");
  });
});

describe("mapDeployReportType", () => {
  it("maps clear/precheck and folds deploy variants into standard", () => {
    expect(mapDeployReportType("clear").value).toBe("clear");
    expect(mapDeployReportType("precheck").value).toBe("precheck");
    for (const rt of ["wait_time", "busy", "standard", null, undefined]) {
      expect(mapDeployReportType(rt)).toEqual({ value: "standard", warnings: [] });
    }
  });

  it("unknown values warn and fall back to standard", () => {
    const r = mapDeployReportType("chaos");
    expect(r.value).toBe("standard");
    expect(r.warnings[0]).toContain("chaos");
  });
});

describe("mapDeployFlagReason", () => {
  it("keeps canonical reasons", () => {
    for (const reason of ["wrong_location", "inaccurate", "spam", "other"]) {
      expect(mapDeployFlagReason(reason)).toEqual({ value: reason, warnings: [] });
    }
  });

  it("renames deploy's wrong_checkpoint to wrong_location", () => {
    expect(mapDeployFlagReason("wrong_checkpoint")).toEqual({ value: "wrong_location", warnings: [] });
  });

  it("unknown/null reasons fall back to other with a warning", () => {
    const r = mapDeployFlagReason(null);
    expect(r.value).toBe("other");
    expect(r.warnings[0]).toContain("null");
  });
});

describe("deriveCheckpointCode", () => {
  it("produces a stable slug and uniquifies collisions", () => {
    const taken = new Set<string>();
    expect(deriveCheckpointCode("Terminal 4 Security", taken)).toBe("terminal-4-security");
    expect(deriveCheckpointCode("Terminal 4 Security", taken)).toBe("terminal-4-security-2");
    expect(deriveCheckpointCode("Terminal 4 Security", taken)).toBe("terminal-4-security-3");
  });

  it("is deterministic across independent runs with the same taken set", () => {
    const a = deriveCheckpointCode("Main Checkpoint", new Set());
    const b = deriveCheckpointCode("Main Checkpoint", new Set());
    expect(a).toBe(b);
    expect(a).toBe("main-checkpoint");
  });

  it("falls back to 'checkpoint' for punctuation-only names", () => {
    expect(deriveCheckpointCode("***", new Set())).toBe("checkpoint");
  });

  it("caps the base length so the suffix never pushes past the cap", () => {
    const long = "x".repeat(60);
    const first = deriveCheckpointCode(long, new Set());
    expect(first.length).toBeLessThanOrEqual(48);
  });
});

describe("compatUserEmail", () => {
  it("is deterministic and follows the M1b mailbox convention", () => {
    const a = compatUserEmail("sess_abc");
    const b = compatUserEmail("sess_abc");
    expect(a).toBe(b);
    expect(a).toMatch(/^compat-[0-9a-f]{12}@flyby\.local$/);
    expect(compatUserEmail("sess_other")).not.toBe(a);
  });
});

describe("mapWaitReport", () => {
  it("maps a fully resolvable row preserving the deploy id and timestamps", () => {
    const cpMap = new Map([["ckp_001", "monorepo-cp-1"]]);
    const userMap = new Map([["sess_abc", "user-1"]]);
    const r = mapWaitReport(deployReport(), cpMap, userMap, 2);
    expect(r.warnings).toEqual([]);
    expect(r.value).toEqual({
      id: "wtr_001",
      checkpointId: "monorepo-cp-1",
      minutes: 25,
      source: "crowd",
      reportType: "standard",
      reportedAt: new Date("2026-10-01T10:00:00Z"),
      userId: "user-1",
      flagCount: 2,
      createdAt: new Date("2026-10-01T10:00:05Z"),
    });
  });

  it("unresolved checkpoints return null checkpointId plus a warning (skip-and-count, never guessed)", () => {
    const r = mapWaitReport(deployReport(), new Map(), new Map(), 0);
    expect(r.value.checkpointId).toBeNull();
    expect(r.warnings.some((w) => w.includes("unresolved"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("wtr_001"))).toBe(true);
  });

  it("null sessionId maps to null userId; unknown sessions warn nothing (sparse map is legal)", () => {
    const noSession = mapWaitReport(deployReport({ sessionId: null }), new Map([["ckp_001", "cp"]]), new Map(), 0);
    expect(noSession.value.userId).toBeNull();

    const unknownSession = mapWaitReport(deployReport(), new Map([["ckp_001", "cp"]]), new Map(), 0);
    expect(unknownSession.value.userId).toBeNull();
  });
});

describe("mapDeployAirport", () => {
  const valid = {
    id: "apt_1",
    iataCode: "JFK",
    name: "John F. Kennedy International",
    city: "New York",
    country: "US",
    timezone: "America/New_York",
    latitude: 40.64,
    longitude: -73.78,
    createdAt: new Date("2025-01-01T00:00:00Z"),
  };

  it("maps a complete row preserving identity fields", () => {
    const r = mapDeployAirport(valid);
    expect(r.warnings).toEqual([]);
    expect(r.value).toMatchObject({ code: "JFK", city: "New York", timezone: "America/New_York" });
  });

  it("skips rows with missing required identity (warned, never invented)", () => {
    expect(mapDeployAirport({ ...valid, iataCode: "" }).value).toBeNull();
    expect(mapDeployAirport({ ...valid, name: null as unknown as string }).warnings.length).toBe(1);
    expect(mapDeployAirport({ ...valid, city: null as unknown as string }).value).toBeNull();
  });

  it("skips rows missing country or timezone (monorepo requires them)", () => {
    const noTz = mapDeployAirport({ ...valid, timezone: null });
    expect(noTz.value).toBeNull();
    expect(noTz.warnings[0]).toContain("JFK");

    const noCountry = mapDeployAirport({ ...valid, country: null });
    expect(noCountry.value).toBeNull();
  });
});

describe("mapDeployCheckpointForCreate", () => {
  it("preserves the deploy id (idempotent re-runs) and builds create shape", () => {
    const row = { id: "ckp_001", name: "Terminal 4 Security", terminal: "T4", createdAt: new Date("2025-06-01T00:00:00Z") };
    const created = mapDeployCheckpointForCreate(row, "monorepo-airport-1", "terminal-4-security");
    expect(created).toEqual({
      id: "ckp_001",
      airportId: "monorepo-airport-1",
      code: "terminal-4-security",
      name: "Terminal 4 Security",
      terminal: "T4",
      createdAt: row.createdAt,
    });
  });
});

describe("mapDeployReportFlag", () => {
  it("maps flags and placeholders a null sessionId (unique constraint requires one)", () => {
    const r = mapDeployReportFlag({
      id: "flag_1",
      reportId: "wtr_001",
      reason: "inaccurate",
      note: "wrong line",
      sessionId: "sess_1",
      createdAt: new Date("2026-10-02T00:00:00Z"),
    });
    expect(r.warnings).toEqual([]);
    expect(r.value).toMatchObject({ reportId: "wtr_001", reason: "inaccurate", sessionId: "sess_1" });

    const noSession = mapDeployReportFlag({
      id: "flag_2",
      reportId: "wtr_002",
      reason: "spam",
      note: null,
      sessionId: null,
      createdAt: new Date("2026-10-02T00:00:00Z"),
    });
    expect(noSession.value.sessionId).toBe("migrated-deploy-session");
    expect(noSession.value.reason).toBe("spam");
  });

  it("warns on unknown reasons instead of dropping the flag", () => {
    const r = mapDeployReportFlag({
      id: "flag_3",
      reportId: "wtr_003",
      reason: "vibes",
      note: null,
      sessionId: "s",
      createdAt: new Date("2026-10-02T00:00:00Z"),
    });
    expect(r.value.reason).toBe("other");
    expect(r.warnings[0]).toContain("vibes");
  });
});
