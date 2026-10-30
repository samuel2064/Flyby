/**
 * Staging verification harness (TIR-339 / M2 -> M3 entry gate).
 *
 * Referenced by docs/LAUNCH-CHECKLIST.md ("Staging Verification (one command)")
 * and authored here. Proves a staging (or local dry-run) deployment is alive,
 * PRODUCTION-configured, seeded, contract-shaped, and PWA-serving - the fast
 * pre-flight that must pass BEFORE the 32-probe contract corpus
 * (scripts/contract-compare.mjs) is run as the M3 byte-match gate.
 *
 * Usage:
 *   node scripts/staging-verify.mjs \
 *     --api https://flyby-api-staging.onrender.com \
 *     --web https://flyby-web-staging.onrender.com \
 *     --report tmp/staging-verify-staging.json
 *
 * Local dry-run (API only, dev env), e.g. against `npm run dev:api` on :3197:
 *   node scripts/staging-verify.mjs \
 *     --api http://127.0.0.1:3197 --expect-env development --web ""
 *
 * Exit 0 = contract-alive. Exit 1 = at least one check failed (report written).
 *
 * Design: all network access goes through an injected fetch-like function so
 * runChecks() is unit-testable with fixtures and no live server (see
 * packages/e2e/staging-verify.test.ts).
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_API = process.env.STAGING_API_URL || "http://127.0.0.1:3197";
export const DEFAULT_WEB = process.env.STAGING_WEB_URL || "";
export const DEFAULT_MIN_AIRPORTS = 51;

/** apt-<3 lowercase letters> id form the deploy contract uses. */
export function isAptId(value) {
  return typeof value === "string" && /^apt-[a-z]{3}$/.test(value);
}

/** A health body is "ok" only when both services report ok and status is ok. */
export function healthFailures(health) {
  const failures = [];
  if (!health || typeof health !== "object") return ["health body is not an object"];
  if (health.status !== "ok") failures.push(`status=${JSON.stringify(health.status)} (want "ok")`);
  if (health.services?.database !== "ok") failures.push(`services.database=${JSON.stringify(health.services?.database)}`);
  if (health.services?.redis !== "ok") failures.push(`services.redis=${JSON.stringify(health.services?.redis)}`);
  return failures;
}

export function parseArgs(argv) {
  // A flag's value must not swallow the NEXT flag. Empty-string values are
  // dropped by some shells (PowerShell drops `--web ""`), which would otherwise
  // make `--web --expect-env any` read web="--expect-env" and silently hit the
  // wrong origin. Refuse flag-like tokens and fall back to the default.
  const arg = (flag, dflt) => {
    const i = argv.indexOf(flag);
    if (i < 0) return dflt;
    const next = argv[i + 1];
    return next !== undefined && !next.startsWith("--") ? next : dflt;
  };
  return {
    api: arg("--api", DEFAULT_API).replace(/\/+$/, ""),
    web: arg("--web", DEFAULT_WEB).replace(/\/+$/, ""),
    report: arg("--report", ""),
    expectEnv: arg("--expect-env", "production"),
    minAirports: Number(arg("--min-airports", String(DEFAULT_MIN_AIRPORTS))),
    timeoutMs: Number(arg("--timeout-ms", "60000")),
  };
}

async function getJson(fetchImpl, url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ac.signal });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function getText(fetchImpl, url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ac.signal });
    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Reads an SSE stream until the first `data:` frame arrives, then aborts. */
async function getFirstSseFrame(fetchImpl, url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let frame = null;
  try {
    const res = await fetchImpl(url, { signal: ac.signal, headers: { Accept: "text/event-stream" } });
    if (res.status !== 200 || !res.body) return { status: res.status, frame: null };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // Bounded read: the contract unit is the first frame; anything longer is a bug.
    for (let i = 0; i < 64; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const line = buf.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        frame = line.slice("data: ".length);
        break;
      }
    }
    await reader.cancel().catch(() => {});
    return { status: res.status, frame };
  } catch {
    return { status: 0, frame: null };
  } finally {
    clearTimeout(timer);
    // Tear down the underlying request/socket. Without this the keep-alive
    // connection lingers and process.exit() trips a libuv assertion
    // ("UV_HANDLE_CLOSING") on Windows, corrupting the exit code.
    ac.abort();
  }
}

/**
 * Runs every staging check against the configured origins. Returns an array of
 * { label, status: "pass"|"fail"|"skip", detail } rows.
 */
export async function runChecks(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const rows = [];
  const record = (label, ok, detail, skipped = false) =>
    rows.push({ label, status: skipped ? "skip" : ok ? "pass" : "fail", detail });

  // 1. health + services
  let health = null;
  try {
    const { status, json } = await getJson(fetchImpl, `${config.api}/api/health`, config.timeoutMs);
    health = json;
    const failures = healthFailures(json);
    record(
      "health + services ok",
      status === 200 && failures.length === 0,
      status !== 200 ? `HTTP ${status}` : failures.join("; ") || "database+redis ok, status ok",
    );
  } catch (err) {
    record("health + services ok", false, `request failed: ${err.message}`);
  }

  // 2. environment pin
  if (config.expectEnv === "any") {
    record("NODE_ENV pin", true, "skipped (--expect-env any)", true);
  } else {
    const env = health?.environment;
    record(
      `environment == ${config.expectEnv}`,
      env === config.expectEnv,
      env === config.expectEnv ? env : `got ${JSON.stringify(env)}`,
    );
  }

  // 3. seed coverage
  try {
    const { status, json } = await getJson(fetchImpl, `${config.api}/api/airports`, config.timeoutMs);
    const airports = Array.isArray(json?.airports) ? json.airports : [];
    const idsOk = airports.length > 0 && airports.every((a) => isAptId(a?.id));
    record(
      `seed >= ${config.minAirports} airports`,
      status === 200 && airports.length >= config.minAirports && idsOk,
      status !== 200
        ? `HTTP ${status}`
        : `${airports.length} airports, apt- ids ${idsOk ? "ok" : "MALFORMED"}`,
    );
  } catch (err) {
    record(`seed >= ${config.minAirports} airports`, false, `request failed: ${err.message}`);
  }

  // 4. apt- id resolution on the detail route.
  // The monorepo serves /api/airports/:code with its native richer shape
  // ({data:{...airport, checkpoints}}); the deploy contract returned the flat
  // airport object. Both wrappers are accepted - this is the documented,
  // QA-coordinated divergence (^/api/airports/[^/]+$ in
  // scripts/approved-divergences.json: "QA retargets to contract, not byte
  // shape, for detail endpoints"). What this check actually proves is that
  // an apt-<code> id RESOLVES to the right airport on staging; `apt-` id SHAPE
  // is enforced by the seed-coverage check (#3), not here, because the native
  // detail row's `id` is a UUID by design.
  try {
    const { status, json } = await getJson(fetchImpl, `${config.api}/api/airports/apt-jfk`, config.timeoutMs);
    const airport = json?.data ?? json;
    const ok = status === 200 && airport?.code === "JFK";
    record(
      "airport detail by apt-id (apt-jfk) resolves JFK",
      ok,
      status !== 200
        ? `HTTP ${status}`
        : `code=${JSON.stringify(airport?.code)} id=${JSON.stringify(airport?.id)}`,
    );
  } catch (err) {
    record("airport detail by apt-id (apt-jfk) resolves JFK", false, `request failed: ${err.message}`);
  }

  // 5. checkpoint detail + ck-slug resolution
  try {
    const { status, json } = await getJson(fetchImpl, `${config.api}/api/checkpoints/ck-jfk-main`, config.timeoutMs);
    const shaped = status === 200 && json !== null && typeof json === "object";
    record(
      "checkpoint detail + ck-slug resolution (ck-jfk-main)",
      shaped,
      status !== 200 ? `HTTP ${status}` : "ck-jfk-main resolved to a checkpoint row",
    );
  } catch (err) {
    record("checkpoint detail + ck-slug resolution (ck-jfk-main)", false, `request failed: ${err.message}`);
  }

  // 6. vapid public key (push surface wired, not stubbed)
  try {
    const { status, json } = await getJson(fetchImpl, `${config.api}/api/vapid-public-key`, config.timeoutMs);
    const ok = status === 200 && typeof json?.publicKey === "string" && json.publicKey.length > 0;
    record("vapid public key present", ok, status !== 200 ? `HTTP ${status}` : ok ? "publicKey non-empty" : "missing/empty publicKey");
  } catch (err) {
    record("vapid public key present", false, `request failed: ${err.message}`);
  }

  // 7. SSE connect frame (real-time surface alive)
  try {
    const { frame } = await getFirstSseFrame(fetchImpl, `${config.api}/api/events`, 5000);
    let parsed = null;
    try {
      parsed = frame ? JSON.parse(frame) : null;
    } catch {
      parsed = null;
    }
    record("SSE connect frame", parsed?.type === "connected", parsed?.type === "connected" ? "type=connected" : `frame=${JSON.stringify(frame)}`);
  } catch (err) {
    record("SSE connect frame", false, `request failed: ${err.message}`);
  }

  // 8-10. web surface (index, manifest, service worker) - skipped when no --web
  if (!config.web) {
    record("web index serves app shell", true, "skipped (no --web)", true);
    record("web PWA manifest", true, "skipped (no --web)", true);
    record("web service worker (sw.js)", true, "skipped (no --web)", true);
  } else {
    try {
      const { status, text } = await getText(fetchImpl, `${config.web}/`, config.timeoutMs);
      const ok = status === 200 && text.includes('id="root"');
      record("web index serves app shell", ok, status !== 200 ? `HTTP ${status}` : ok ? 'contains id="root"' : "app shell marker missing");
    } catch (err) {
      record("web index serves app shell", false, `request failed: ${err.message}`);
    }
    try {
      let res = await getJson(fetchImpl, `${config.web}/manifest.webmanifest`, config.timeoutMs);
      if (res.status !== 200) res = await getJson(fetchImpl, `${config.web}/manifest.json`, config.timeoutMs);
      const named = res.json?.name || res.json?.short_name;
      record("web PWA manifest", res.status === 200 && Boolean(named), res.status !== 200 ? `HTTP ${res.status}` : `name=${JSON.stringify(named)}`);
    } catch (err) {
      record("web PWA manifest", false, `request failed: ${err.message}`);
    }
    try {
      const { status, text } = await getText(fetchImpl, `${config.web}/sw.js`, config.timeoutMs);
      record("web service worker (sw.js)", status === 200 && text.length > 0, status !== 200 ? `HTTP ${status}` : `${text.length} bytes`);
    } catch (err) {
      record("web service worker (sw.js)", false, `request failed: ${err.message}`);
    }
  }

  return rows;
}

export function summarize(rows) {
  const passed = rows.filter((r) => r.status === "pass").length;
  const failed = rows.filter((r) => r.status === "fail").length;
  const skipped = rows.filter((r) => r.status === "skip").length;
  const verdict = failed > 0 ? "FAIL" : skipped > 0 ? "PASS (with skips)" : "PASS";
  return { verdict, passed, failed, skipped };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log(`Staging verify: api=${config.api} web=${config.web || "(skipped)"} expect-env=${config.expectEnv}`);
  const rows = await runChecks(config);
  for (const row of rows) {
    const tag = row.status === "fail" ? "FAIL" : row.status === "skip" ? "SKIP" : "OK  ";
    console.log(`${tag}  ${row.label} - ${row.detail}`);
  }
  const { verdict, passed, failed, skipped } = summarize(rows);
  console.log(`passed=${passed} failed=${failed} skipped=${skipped} -> ${verdict}`);
  if (config.report) {
    writeFileSync(config.report, JSON.stringify({ verdict, passed, failed, skipped, checks: rows }, null, 2));
  }
  // Set the exit code and let the event loop drain rather than calling
  // process.exit(); an immediate exit while a fetch socket handle is still
  // closing trips a libuv assertion ("UV_HANDLE_CLOSING") on Windows.
  process.exitCode = failed > 0 ? 1 : 0;
}

// Only run when executed directly (imported by tests otherwise).
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
