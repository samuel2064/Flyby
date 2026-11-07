import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// The harness is plain ESM at the repo root; importing it here exercises the
// exact functions the `node scripts/live-smoke.mjs` CLI runs.
import { parseArgs, runChecks, smokeIdentity, unwrapList } from "../../scripts/live-smoke.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Live smoke harness test (TIR-339 / M4 Step 4).
 *
 * scripts/live-smoke.mjs is the post-cutover write-path smoke ("Live smoke +
 * 30-min watch window" in docs/LAUNCH-CHECKLIST.md). These tests drive its
 * injected-fetch layer with fixtures so the write->read->latency->cleanup
 * logic is locked without needing a live server.
 */

type Res = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  body?: unknown;
};

const jsonRes = (status: number, body: unknown): Res => ({
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const sseRes = (frame: string): Res => {
  const encoded = [new TextEncoder().encode(`data: ${frame}\n\n`)];
  let i = 0;
  return {
    status: 200,
    json: async () => ({}),
    text: async () => "",
    body: {
      getReader: () => ({
        read: async () =>
          i < encoded.length ? { value: encoded[i++], done: false } : { value: undefined, done: true },
        cancel: async () => {},
      }),
    },
  };
};

type Req = { url: string; method?: string; headers?: Record<string, string>; body?: string };

/** Fixture fetch that records every request for assertions. */
function makeFetch(routes: Array<[string | RegExp, Res | ((req: Req) => Res)]>, log: Req[] = []): typeof fetch {
  return (async (url: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const u = String(url);
    const req: Req = { url: u, method: init?.method, headers: init?.headers, body: init?.body };
    log.push(req);
    for (const [matcher, res] of routes) {
      const hit = typeof matcher === "string" ? u.includes(matcher) : matcher.test(u);
      if (hit) {
        const r = typeof res === "function" ? res(req) : res;
        // Emulate network latency so latency-budget checks have a sample.
        if (r && (r as Res & { delayMs?: number }).delayMs) {
          await new Promise((ok) => setTimeout(ok, (r as Res & { delayMs?: number }).delayMs));
        }
        return r;
      }
    }
    throw new Error(`no stub for ${u}`);
  }) as unknown as typeof fetch;
}

const baseConfig = {
  api: "https://api.test",
  airport: "",
  maxPostMs: 5000,
  timeoutMs: 1000,
  pollAttempts: 3,
  pollIntervalMs: 10,
  keepReports: false,
  adminKey: "test-admin-key",
  identity: "smoke-fixed-identity",
  report: "",
};

const report201 = (id = "wt-1", minutes = 12) => ({
  id,
  airport: "JFK",
  checkpoint: "Main",
  waitMinutes: minutes,
  receivedAt: "2026-11-07T00:00:00.000Z",
});

function greenRoutes(opts: {
  log?: Req[];
  waitMinutes?: number;
  reportId?: string;
  visibleAfter?: number; // how many GET polls return without the row first
  cleanupStatus?: number;
  cleanupRes?: Res;
  adminKeyRequired?: boolean;
} = {}): Array<[string | RegExp, Res | ((req: Req) => Res)]> {
  const {
    log = [],
    waitMinutes = 12,
    reportId = "wt-1",
    visibleAfter = 0,
    cleanupStatus = 204,
    cleanupRes,
    adminKeyRequired = false,
  } = opts;
  let polls = 0;
  return [
    [
      "/api/wait-times?airport=",
      (req: Req) => {
        polls++;
        const rows =
          polls > visibleAfter
            ? [{ id: reportId, airport: "JFK", checkpoint: "Main", waitMinutes, updatedAt: "2026-11-07T00:00:00.000Z" }]
            : [{ id: "someone-else", airport: "JFK", checkpoint: "Main", waitMinutes: 9, updatedAt: "2026-11-06T23:00:00.000Z" }];
        return jsonRes(200, rows);
      },
    ],
    [
      "/api/wait-times",
      (req: Req) => {
        if (req.method !== "POST") return jsonRes(405, { error: "method" });
        const body = JSON.parse(req.body || "{}");
        return jsonRes(201, report201(reportId, body.waitMinutes));
      },
    ],
    ["/api/reports/", cleanupRes ?? ((req: Req) => {
      if (adminKeyRequired && req.headers?.["x-admin-key"] !== "test-admin-key") {
        return jsonRes(401, { error: "Invalid or missing admin key" });
      }
      return { status: cleanupStatus, json: async () => (cleanupStatus === 204 ? undefined : { error: "nope" }), text: async () => "" };
    })],
    ["/api/airports", jsonRes(200, { airports: [{ id: "apt-jfk", code: "JFK" }, { id: "apt-lax", code: "LAX" }] })],
    ["/api/health", jsonRes(200, { status: "ok", environment: "production", services: { database: "ok", redis: "ok" } })],
    ["/api/events", sseRes('{"type":"connected"}')],
  ];
}

const row = (rows: Awaited<ReturnType<typeof runChecks>>, label: string) => rows.find((r) => r.label === label);

describe("live-smoke harness (TIR-339 M4)", () => {
  it("passes the full write->read->latency->cleanup cycle against a green fixture", async () => {
    const log: Req[] = [];
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(greenRoutes({ log }), log) });
    expect(rows.filter((r) => r.status === "fail")).toEqual([]);
    expect(summarizeRows(rows).verdict).toBe("PASS");
    expect(row(rows, "report write (POST /api/wait-times -> 201)")?.status).toBe("pass");
    expect(row(rows, "read-after-write visible")?.status).toBe("pass");
    expect(row(rows, "report submission latency within budget")?.status).toBe("pass");
    expect(row(rows, "smoke report cleanup")?.status).toBe("pass");
    expect(row(rows, "smoke report cleanup")?.detail).toContain("deleted wt-1");
    expect(row(rows, "SSE connect frame")?.status).toBe("pass");

    // The POST must carry the smoke identity and a valid crowd-report body.
    const post = log.find((r) => r.method === "POST" && r.url.includes("/api/wait-times"));
    expect(post?.headers?.["X-User-Id"]).toBe("smoke-fixed-identity");
    const body = JSON.parse(post!.body!);
    expect(body.airport).toBe("JFK");
    expect(Number.isInteger(body.waitMinutes)).toBe(true);
    expect(body.waitMinutes).toBeGreaterThanOrEqual(1);
    expect(body.waitMinutes).toBeLessThanOrEqual(300);

    // The cleanup DELETE must carry the admin key header.
    const del = log.find((r) => r.method === "DELETE");
    expect(del?.headers?.["X-Admin-Key"]).toBe("test-admin-key");
  });

  it("auto-selects the first airport code as the smoke target", async () => {
    const log: Req[] = [];
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(greenRoutes({ log }), log) });
    expect(row(rows, "airports list reachable")?.detail).toContain("smoke target=JFK");
  });

  it("honors --airport when given", async () => {
    const log: Req[] = [];
    await runChecks({ ...baseConfig, airport: "lax" }, { fetchImpl: makeFetch(greenRoutes({ log }), log) });
    const post = log.find((r) => r.method === "POST");
    expect(JSON.parse(post!.body!).airport).toBe("LAX");
  });

  it("accepts a bare-array airports response (deploy shape)", async () => {
    const routes: Array<[string | RegExp, Res]> = [
      ["/api/airports", jsonRes(200, [{ id: "apt-jfk", code: "JFK" }])],
      ...greenRoutes().filter(([m]) => String(m) !== "/api/airports"),
    ];
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "airports list reachable")?.status).toBe("pass");
  });

  it("fails the write row on a 429 and skips latency/read/cleanup without a report id", async () => {
    const routes: Array<[string | RegExp, Res]> = [
      ["/api/wait-times", jsonRes(429, { errors: [{ field: "rateLimit", message: "Too many reports; retry in 30s" }] })],
      ...greenRoutes().filter(([m]) => String(m) !== "/api/wait-times" && String(m) !== "/api/reports/"),
    ];
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "report write (POST /api/wait-times -> 201)")?.status).toBe("fail");
    expect(row(rows, "report write (POST /api/wait-times -> 201)")?.detail).toContain("429");
    expect(row(rows, "read-after-write visible")?.status).toBe("skip");
    expect(row(rows, "report submission latency within budget")?.status).toBe("skip");
    expect(row(rows, "smoke report cleanup")?.status).toBe("skip");
    expect(summarizeRows(rows).verdict).toBe("FAIL");
  });

  it("retries read-after-write until the row appears", async () => {
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(greenRoutes({ visibleAfter: 2 })) });
    const rw = row(rows, "read-after-write visible");
    expect(rw?.status).toBe("pass");
    expect(rw?.detail).toContain("poll 3");
  });

  it("fails read-after-write when the row never appears", async () => {
    const routes: Array<[string | RegExp, Res]> = [
      ["/api/wait-times?airport=", jsonRes(200, [])],
      ...greenRoutes().filter(([m]) => !String(m).startsWith("/api/wait-times?airport=")),
    ];
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "read-after-write visible")?.status).toBe("fail");
  });

  it("fails read-after-write on a malformed row (wrong waitMinutes)", async () => {
    const routes: Array<[string | RegExp, Res]> = [
      ["/api/wait-times?airport=", jsonRes(200, [{ id: "wt-1", airport: "JFK", checkpoint: "Main", waitMinutes: 999, updatedAt: "x" }])],
      ...greenRoutes().filter(([m]) => !String(m).startsWith("/api/wait-times?airport=")),
    ];
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "read-after-write visible")?.status).toBe("fail");
  });

  it("fails the latency row when the write exceeds the budget", async () => {
    const routes: Array<[string | RegExp, Res | ((req: Req) => Res)]> = greenRoutes().map(([m, r]) => {
      if (String(m) === "/api/wait-times") {
        const delayed = (req: Req) => {
          const base = r as (req: Req) => Res;
          const res = base(req);
          return Object.assign(res, { delayMs: 30 });
        };
        return [m, delayed];
      }
      return [m, r];
    });
    const rows = await runChecks({ ...baseConfig, maxPostMs: 5 }, { fetchImpl: makeFetch(routes) });
    const latency = row(rows, "report submission latency within budget");
    expect(latency?.status).toBe("fail");
    expect(latency?.detail).toContain("(budget 5ms)");
  });

  it("skips cleanup without an admin key and leaves the row in place", async () => {
    const rows = await runChecks({ ...baseConfig, adminKey: "" }, { fetchImpl: makeFetch(greenRoutes()) });
    const cleanup = row(rows, "smoke report cleanup");
    expect(cleanup?.status).toBe("skip");
    expect(cleanup?.detail).toContain("left in place");
  });

  it("skips cleanup with --keep-reports", async () => {
    const rows = await runChecks({ ...baseConfig, keepReports: true }, { fetchImpl: makeFetch(greenRoutes()) });
    expect(row(rows, "smoke report cleanup")?.status).toBe("skip");
  });

  it("counts a 404 cleanup as already-gone (pass)", async () => {
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(greenRoutes({ cleanupStatus: 404 })) });
    const cleanup = row(rows, "smoke report cleanup");
    expect(cleanup?.status).toBe("pass");
    expect(cleanup?.detail).toContain("already gone");
  });

  it("skips cleanup when moderation is disabled (503) but still passes the overall run", async () => {
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(greenRoutes({ cleanupStatus: 503 })) });
    expect(row(rows, "smoke report cleanup")?.status).toBe("skip");
    expect(summarizeRows(rows).failed).toBe(0);
  });

  it("fails the health row when a service is degraded (and still reports the rest)", async () => {
    const routes: Array<[string | RegExp, Res]> = [
      ["/api/health", jsonRes(200, { status: "ok", services: { database: "ok", redis: "error" } })],
      ...greenRoutes().filter(([m]) => String(m) !== "/api/health"),
    ];
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "health ok")?.status).toBe("fail");
    expect(row(rows, "health ok")?.detail).toContain("redis=\"error\"");
    expect(row(rows, "report write (POST /api/wait-times -> 201)")?.status).toBe("pass");
  });

  it("generates a unique rate-limit identity per run", () => {
    const a = smokeIdentity();
    const b = smokeIdentity();
    expect(a).toMatch(/^smoke-\d{8}T\d{6}Z-[0-9a-f]{4}$/);
    expect(a).not.toBe(b);
  });

  it("unwrapList accepts deploy bare arrays and wrapped shapes", () => {
    expect(unwrapList([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(unwrapList({ data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(unwrapList({ rows: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(unwrapList({ airports: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(unwrapList({ nope: true })).toEqual([]);
    expect(unwrapList(null)).toEqual([]);
  });

  it("parseArgs: defaults, flag-swallow guard and boolean --keep-reports", () => {
    const cfg = parseArgs([
      "--api", "https://a.test/",
      "--airport", "jfk",
      "--max-post-ms", "2500",
      "--timeout-ms", "9000",
      "--poll-attempts", "2",
      "--poll-interval-ms", "50",
      "--keep-reports",
      "--report", "out.json",
    ]);
    expect(cfg.api).toBe("https://a.test");
    expect(cfg.airport).toBe("jfk");
    expect(cfg.maxPostMs).toBe(2500);
    expect(cfg.timeoutMs).toBe(9000);
    expect(cfg.pollAttempts).toBe(2);
    expect(cfg.pollIntervalMs).toBe(50);
    expect(cfg.keepReports).toBe(true);
    expect(cfg.report).toBe("out.json");
    expect(cfg.identity).toMatch(/^smoke-/);

    const dflt = parseArgs([]);
    expect(dflt.api).toBe("http://127.0.0.1:3197");
    expect(dflt.maxPostMs).toBe(5000);
    expect(dflt.keepReports).toBe(false);
    expect(dflt.pollAttempts).toBe(5);

    // A valueless flag must not swallow the next flag (PowerShell drops "").
    const guarded = parseArgs(["--api", "--report", "x.json"]);
    expect(guarded.api).not.toContain("--report");
    expect(guarded.report).toBe("x.json");
  });
});

describe("live-smoke wiring (TIR-339 - the M4 smoke cannot drift)", () => {
  it("exposes the harness as the root `smoke:live` npm script", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
    expect(pkg.scripts["smoke:live"]).toBe("node scripts/live-smoke.mjs");
  });

  it("keeps the launch checklist pointed at the real smoke command", () => {
    const checklist = readFileSync(resolve(repoRoot, "docs", "LAUNCH-CHECKLIST.md"), "utf8");
    expect(checklist).toContain("npm run smoke:live");
    expect(checklist).toContain("scripts/live-smoke.mjs");
  });

  it("ships the live-smoke GitHub workflow that M4 references", () => {
    const workflowPath = resolve(repoRoot, ".github", "workflows", "live-smoke.yml");
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("scripts/live-smoke.mjs");
    expect(workflow).toContain("ENABLE_LIVE_SMOKE");
    expect(existsSync(resolve(repoRoot, "scripts", "live-smoke.mjs"))).toBe(true);
  });
});

// Local import mirror of scripts/staging-verify.mjs summarize so tests do not
// depend on module import order between the two harnesses.
function summarizeRows(rows: Array<{ status: string }>) {
  const passed = rows.filter((r) => r.status === "pass").length;
  const failed = rows.filter((r) => r.status === "fail").length;
  const skipped = rows.filter((r) => r.status === "skip").length;
  const verdict = failed > 0 ? "FAIL" : skipped > 0 ? "PASS (with skips)" : "PASS";
  return { verdict, passed, failed, skipped };
}
