import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// The harness is plain ESM at the repo root; importing it here exercises the
// exact functions the `node scripts/staging-verify.mjs` CLI runs.
import { isAptId, healthFailures, parseArgs, runChecks, summarize } from "../../scripts/staging-verify.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Staging verification harness test (TIR-339 / M2 -> M3 entry gate).
 *
 * scripts/staging-verify.mjs is the "one command" in docs/LAUNCH-CHECKLIST.md.
 * These tests drive its injected-fetch layer with fixtures so the pre-flight
 * logic (health, env pin, seed coverage, apt-/ck- shapes, vapid, SSE, web PWA)
 * is locked without needing a live staging environment.
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

const textRes = (status: number, text: string): Res => ({
  status,
  json: async () => {
    throw new Error("not json");
  },
  text: async () => text,
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

function makeFetch(routes: Array<[string | RegExp, Res]>): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    for (const [matcher, res] of routes) {
      const hit = typeof matcher === "string" ? u.includes(matcher) : matcher.test(u);
      if (hit) return res;
    }
    throw new Error(`no stub for ${u}`);
  }) as unknown as typeof fetch;
}

const baseConfig = {
  api: "https://api.test",
  web: "https://web.test",
  report: "",
  expectEnv: "production",
  minAirports: 51,
  timeoutMs: 1000,
};

const airports51 = {
  airports: Array.from({ length: 51 }, () => ({ id: "apt-jfk", code: "JFK", name: "JFK", city: "NY", timezone: "X" })),
};

function greenRoutes(): Array<[string | RegExp, Res]> {
  return [
    ["/api/checkpoints/ck-jfk-main", jsonRes(200, { id: "ck-jfk-main", name: "Main" })],
    // Native monorepo detail shape: `{ data: { ...airport, checkpoints } }`
    // with a UUID `id` (the approved divergence in scripts/approved-divergences.json).
    [
      "/api/airports/apt-jfk",
      jsonRes(200, { data: { id: "35c8bc1b-bb7c-41dc-9244-418c1c8aaac1", code: "JFK", name: "JFK" } }),
    ],
    ["/api/airports", jsonRes(200, airports51)],
    ["/api/health", jsonRes(200, { status: "ok", environment: "production", services: { database: "ok", redis: "ok" } })],
    ["/api/vapid-public-key", jsonRes(200, { publicKey: "BEl62iUYg" })],
    ["/api/events", sseRes('{"type":"connected"}')],
    ["/manifest.webmanifest", jsonRes(200, { name: "Flyby", short_name: "Flyby" })],
    ["/sw.js", textRes(200, "// service worker")],
    [/^https:\/\/web\.test\/$/, textRes(200, '<!doctype html><div id="root"></div>')],
  ];
}

const row = (rows: Awaited<ReturnType<typeof runChecks>>, label: string) => rows.find((r) => r.label === label);

describe("staging-verify harness (TIR-339)", () => {
  it("passes every check against a fully green staging fixture", async () => {
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(greenRoutes()) });
    expect(rows.filter((r) => r.status === "fail")).toEqual([]);
    expect(summarize(rows).verdict).toBe("PASS");
    expect(row(rows, "SSE connect frame")?.status).toBe("pass");
    expect(row(rows, "seed >= 51 airports")?.status).toBe("pass");
  });

  it("fails the health check when a service is degraded", async () => {
    const routes = greenRoutes().map(
      ([m, r]) =>
        [m, m === "/api/health" ? jsonRes(200, { status: "degraded", environment: "production", services: { database: "error", redis: "ok" } }) : r] as [
          string | RegExp,
          Res,
        ],
    );
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "health + services ok")?.status).toBe("fail");
    expect(summarize(rows).failed).toBeGreaterThan(0);
  });

  it("fails the environment pin on a non-production deploy", async () => {
    const routes = greenRoutes().map(
      ([m, r]) =>
        [m, m === "/api/health" ? jsonRes(200, { status: "ok", environment: "development", services: { database: "ok", redis: "ok" } }) : r] as [
          string | RegExp,
          Res,
        ],
    );
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "environment == production")?.status).toBe("fail");
  });

  it("fails seed coverage when fewer than the minimum airports exist", async () => {
    const routes = greenRoutes().map(
      ([m, r]) =>
        [m, m === "/api/airports" ? jsonRes(200, { airports: [{ id: "apt-jfk", code: "JFK" }] }) : r] as [string | RegExp, Res],
    );
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "seed >= 51 airports")?.status).toBe("fail");
  });

  // Seed coverage is where `apt-` id SHAPE is enforced (isAptId); the detail
  // route check is resolution-based (the served airport's `code` must be JFK),
  // so a malformed seed id must fail the seed row while a code-correct detail
  // response still passes.
  it("fails seed coverage on malformed apt- ids (detail resolution is code-based)", async () => {
    const routes = greenRoutes().map(
      ([m, r]) =>
        [
          m,
          m === "/api/airports"
            ? jsonRes(200, { airports: Array.from({ length: 51 }, () => ({ id: "jfk", code: "JFK" })) })
            : r,
        ] as [string | RegExp, Res],
    );
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "seed >= 51 airports")?.status).toBe("fail");
    expect(row(rows, "airport detail by apt-id (apt-jfk) resolves JFK")?.status).toBe("pass");
  });

  // Regression: the native monorepo detail row carries a UUID `id`, not an
  // `apt-` id. Requiring `isAptId` on the detail response (the approved
  // divergence permits the native shape) produced a FALSE FAIL against a real
  // staging/local API - the apt-jfk id still resolves to JFK correctly, so the
  // check must pass on code alone.
  it("passes the detail check for the native UUID id shape (approved divergence)", async () => {
    const routes = greenRoutes().map(
      ([m, r]) =>
        [
          m,
          m === "/api/airports/apt-jfk"
            ? jsonRes(200, { data: { id: "35c8bc1b-bb7c-41dc-9244-418c1c8aaac1", code: "JFK" } })
            : r,
        ] as [string | RegExp, Res],
    );
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    const detail = row(rows, "airport detail by apt-id (apt-jfk) resolves JFK");
    expect(detail?.status).toBe("pass");
    expect(detail?.detail).toContain('code="JFK"');
  });

  it("fails the detail check when the apt-id resolves to the wrong airport", async () => {
    const routes = greenRoutes().map(
      ([m, r]) =>
        [
          m,
          m === "/api/airports/apt-jfk"
            ? jsonRes(200, { data: { id: "35c8bc1b-bb7c-41dc-9244-418c1c8aaac1", code: "LAX" } })
            : r,
        ] as [string | RegExp, Res],
    );
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "airport detail by apt-id (apt-jfk) resolves JFK")?.status).toBe("fail");
  });

  it("fails the SSE check when the first frame is not a connect frame", async () => {
    const routes = greenRoutes().map(
      ([m, r]) => [m, m === "/api/events" ? sseRes('{"type":"wait-time-update"}') : r] as [string | RegExp, Res],
    );
    const rows = await runChecks(baseConfig, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "SSE connect frame")?.status).toBe("fail");
  });

  it("skips the web checks (and still passes) when no --web is configured", async () => {
    const routes = greenRoutes().filter(([m]) => String(m).startsWith("/api"));
    const rows = await runChecks({ ...baseConfig, web: "" }, { fetchImpl: makeFetch(routes) });
    expect(row(rows, "web service worker (sw.js)")?.status).toBe("skip");
    const summary = summarize(rows);
    expect(summary.failed).toBe(0);
    expect(summary.verdict).toBe("PASS (with skips)");
  });

  it("pure helpers: isAptId, healthFailures and parseArgs", () => {
    expect(isAptId("apt-jfk")).toBe(true);
    expect(isAptId("apt-jf")).toBe(false);
    expect(isAptId("JFK")).toBe(false);
    expect(healthFailures({ status: "ok", services: { database: "ok", redis: "ok" } })).toEqual([]);
    expect(healthFailures({ status: "unhealthy", services: { database: "error", redis: "error" } }).length).toBe(3);

    const cfg = parseArgs(["--api", "https://a/", "--web", "https://b/", "--expect-env", "any", "--min-airports", "10"]);
    expect(cfg.api).toBe("https://a");
    expect(cfg.web).toBe("https://b");
    expect(cfg.expectEnv).toBe("any");
    expect(cfg.minAirports).toBe(10);
    expect(parseArgs([]).expectEnv).toBe("production");
  });

  it("does not let a valueless flag swallow the next flag (shell-dropped empty args)", () => {
    // PowerShell drops `--web ""`; without the guard, `web` would become
    // "--expect-env" and every web check would hit the wrong origin.
    const cfg = parseArgs(["--web", "--expect-env", "any", "--api", "http://127.0.0.1:59999"]);
    // `web` falls back to its default (env-dependent), never the swallowed flag.
    expect(cfg.web).not.toContain("--expect-env");
    expect(cfg.expectEnv).toBe("any");
    expect(cfg.api).toBe("http://127.0.0.1:59999");
    // Explicit empty value stays empty on shells that keep it (the dry-run form).
    expect(parseArgs(["--web", ""]).web).toBe("");
  });
});

describe("staging-verify wiring (TIR-339 - the 'one command' cannot drift)", () => {
  it("exposes the harness as the root `verify:staging` npm script", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
    expect(pkg.scripts["verify:staging"]).toBe("node scripts/staging-verify.mjs");
  });

  it("keeps the staging checklist docs present and cross-linked", () => {
    const checklistPath = resolve(repoRoot, "docs", "LAUNCH-CHECKLIST.md");
    const verifyPath = resolve(repoRoot, "docs", "STAGING-VERIFY.md");
    expect(existsSync(verifyPath)).toBe(true);
    const checklist = readFileSync(checklistPath, "utf8");
    const verify = readFileSync(verifyPath, "utf8");
    // The checklist must point at the real command + the detail doc (the exact
    // regression this test exists to catch: a referenced-but-missing doc).
    expect(checklist).toContain("npm run verify:staging");
    expect(checklist).toContain("docs/STAGING-VERIFY.md");
    expect(verify).toContain("scripts/staging-verify.mjs");
  });
});
