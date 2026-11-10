/**
 * Live smoke harness (TIR-339 / M4 cutover Step 4: "Live smoke + 30-min watch").
 *
 * Where scripts/staging-verify.mjs proves the READ surface is contract-alive,
 * this harness proves the WRITE path end-to-end against a live origin: submit
 * a real crowd report, see it appear in the wait-times list, measure the
 * submission latency, then clean the row back up with the admin key.
 *
 * It is designed to run against PRODUCTION after the cutover flip (and against
 * staging/local beforehand), so it is deliberately self-contained: health,
 * airports list, POST /api/wait-times, read-after-write, latency budget, SSE
 * connect frame, and admin-key cleanup.
 *
 * Usage:
 *   node scripts/live-smoke.mjs --api https://flyby-api.onrender.com \
 *     --report tmp/live-smoke-prod.json
 *
 *   FLYBY_ADMIN_KEY=... node scripts/live-smoke.mjs --api https://flyby-api.onrender.com
 *     (with the admin key the smoke report row is deleted after the check;
 *      without it the row is left in place and cleanup is reported as skipped)
 *
 * Exit 0 = smoke green. Exit 1 = at least one check failed (report written).
 *
 * Design: all network access goes through an injected fetch-like function so
 * runChecks() is unit-testable with fixtures and no live server (see
 * packages/e2e/live-smoke.test.ts).
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
// Shared with staging-verify: the same bounded SSE read and verdict math, so
// the two harnesses cannot drift.
import { getFirstSseFrame, summarize } from "./staging-verify.mjs";

export const DEFAULT_API = process.env.LIVE_SMOKE_API_URL || "http://127.0.0.1:3197";
export const DEFAULT_MAX_POST_MS = 5000;

/**
 * A fresh smoke identity per run. The compat write route rate-limits one
 * report per identity (X-User-Id or IP) per 30s, so a unique identity keeps
 * back-to-back smoke runs (e.g. the 15-min scheduled watch) from 429-ing.
 */
export function smokeIdentity(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `smoke-${stamp}-${rand}`;
}

export function parseArgs(argv) {
  // Same guard as staging-verify: a flag's value must not swallow the NEXT
  // flag (PowerShell drops empty-string values).
  const arg = (flag, dflt) => {
    const i = argv.indexOf(flag);
    if (i < 0) return dflt;
    const next = argv[i + 1];
    return next !== undefined && !next.startsWith("--") ? next : dflt;
  };
  const has = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && (argv[i + 1] === undefined || argv[i + 1].startsWith("--"));
  };
  return {
    api: arg("--api", DEFAULT_API).replace(/\/+$/, ""),
    airport: arg("--airport", ""),
    maxPostMs: Number(arg("--max-post-ms", String(DEFAULT_MAX_POST_MS))),
    timeoutMs: Number(arg("--timeout-ms", "100000")),
    pollAttempts: Number(arg("--poll-attempts", "5")),
    pollIntervalMs: Number(arg("--poll-interval-ms", "1000")),
    keepReports: has("--keep-reports"),
    adminKey: arg("--admin-key", process.env.FLYBY_ADMIN_KEY || process.env.ADMIN_API_KEY || ""),
    identity: arg("--identity", smokeIdentity()),
    report: arg("--report", ""),
  };
}

async function getJson(fetchImpl, url, timeoutMs, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ac.signal, headers });
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

/** Accepts the deploy bare-array shape and any {data|rows|airports}-wrapped list. */
export function unwrapList(json, listKeys = ["data", "rows", "airports"]) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    for (const key of listKeys) {
      if (Array.isArray(json[key])) return json[key];
    }
  }
  return [];
}

export async function runChecks(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const rows = [];
  const record = (label, ok, detail, skipped = false) =>
    rows.push({ label, status: skipped ? "skip" : ok ? "pass" : "fail", detail });

  // 1. health (precondition read; deploy and monorepo shapes both carry status)
  let healthOk = false;
  try {
    const { status, json } = await getJson(fetchImpl, `${config.api}/api/health`, config.timeoutMs);
    healthOk = status === 200 && json?.status === "ok";
    let detail = status !== 200 ? `HTTP ${status}` : `status=${JSON.stringify(json?.status)}`;
    if (healthOk && json?.services && typeof json.services === "object") {
      const bad = Object.entries(json.services).filter(([, v]) => v !== "ok");
      if (bad.length > 0) {
        healthOk = false;
        detail = `services not ok: ${bad.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")}`;
      } else {
        detail = "status ok, all services ok";
      }
    }
    record("health ok", healthOk, detail);
  } catch (err) {
    record("health ok", false, `request failed: ${err.message}`);
  }

  // 2. airports list reachable + smoke target selection
  let target = null;
  try {
    const { status, json } = await getJson(fetchImpl, `${config.api}/api/airports`, config.timeoutMs);
    const airports = unwrapList(json);
    const requested = String(config.airport || "").trim().toUpperCase();
    const candidate =
      (requested && airports.find((a) => String(a?.code || "").toUpperCase() === requested)) ||
      airports.find((a) => typeof a?.code === "string" && a.code.length > 0) ||
      null;
    target = candidate ? String(candidate.code).toUpperCase() : null;
    record(
      "airports list reachable",
      status === 200 && target !== null,
      status !== 200
        ? `HTTP ${status}`
        : target !== null
          ? `${airports.length} airports; smoke target=${target}`
          : "no airport with a code field in response",
    );
  } catch (err) {
    record("airports list reachable", false, `request failed: ${err.message}`);
  }

  // 3. write path: POST /api/wait-times (the crowd-report surface)
  let createdId = null;
  let postLatencyMs = null;
  let sentMinutes = null;
  if (target === null) {
    record("report write (POST /api/wait-times -> 201)", false, "skipped: no smoke target airport", true);
    record("read-after-write visible", false, "skipped: write never ran", true);
    record("report submission latency within budget", false, "skipped: write never ran", true);
    record("smoke report cleanup", false, "skipped: write never ran", true);
  } else {
    sentMinutes = 5 + (Date.now() % 25);
    const body = JSON.stringify({ airport: target, waitMinutes: sentMinutes });
    const started = Date.now();
    try {
      const res = await fetchImpl(`${config.api}/api/wait-times`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": config.identity,
        },
        body,
      });
      postLatencyMs = Date.now() - started;
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const shapeOk =
        typeof json?.id === "string" &&
        json.id.length > 0 &&
        String(json?.airport || "").toUpperCase() === target &&
        json?.waitMinutes === sentMinutes &&
        typeof json?.receivedAt === "string";
      createdId = shapeOk ? json.id : null;
      record(
        "report write (POST /api/wait-times -> 201)",
        res.status === 201 && shapeOk,
        res.status !== 201
          ? `HTTP ${res.status} body=${JSON.stringify(json)} (identity=${config.identity})`
          : shapeOk
            ? `id=${json.id} minutes=${sentMinutes}`
            : `malformed 201 body: ${JSON.stringify(json)}`,
      );
    } catch (err) {
      postLatencyMs = Date.now() - started;
      record("report write (POST /api/wait-times -> 201)", false, `request failed: ${err.message}`);
    }

    // 4. read-after-write: the submitted report must be publicly visible
    if (createdId === null) {
      record("read-after-write visible", false, "skipped: write did not produce a report id", true);
    } else {
      let visible = false;
      let lastDetail = "";
      for (let attempt = 1; attempt <= Math.max(1, config.pollAttempts); attempt++) {
        try {
          const { status, json } = await getJson(
            fetchImpl,
            `${config.api}/api/wait-times?airport=${encodeURIComponent(target)}`,
            config.timeoutMs,
          );
          const list = unwrapList(json);
          const match = list.find((r) => r?.id === createdId);
          if (status === 200 && match) {
            visible =
              String(match.airport || "").toUpperCase() === target &&
              match.waitMinutes === sentMinutes;
            lastDetail = visible
              ? `row visible on poll ${attempt}`
              : `row ${createdId} found but malformed: ${JSON.stringify(match)}`;
            break;
          }
          lastDetail = `poll ${attempt}: HTTP ${status}, ${list.length} rows`;
        } catch (err) {
          lastDetail = `poll ${attempt}: request failed: ${err.message}`;
        }
        if (attempt < config.pollAttempts) {
          await new Promise((r) => setTimeout(r, config.pollIntervalMs));
        }
      }
      record("read-after-write visible", visible, lastDetail);
    }

    // 5. latency budget for the write
    record(
      "report submission latency within budget",
      postLatencyMs !== null && postLatencyMs <= config.maxPostMs,
      postLatencyMs === null
        ? "no latency sample (write failed)"
        : `${postLatencyMs}ms (budget ${config.maxPostMs}ms)`,
      postLatencyMs === null,
    );

    // 7. cleanup the smoke row (admin-key delete; 404 counts as already gone)
    if (config.keepReports) {
      record("smoke report cleanup", false, "skipped: --keep-reports", true);
    } else if (createdId === null) {
      record("smoke report cleanup", false, "skipped: no report id", true);
    } else if (!config.adminKey) {
      record(
        "smoke report cleanup",
        false,
        `skipped: no admin key (set FLYBY_ADMIN_KEY) - row ${createdId} left in place`,
        true,
      );
    } else {
      try {
        const res = await fetchImpl(`${config.api}/api/reports/${createdId}`, {
          method: "DELETE",
          headers: { "X-Admin-Key": config.adminKey },
        });
        if (res.status === 204) {
          record("smoke report cleanup", true, `deleted ${createdId}`);
        } else if (res.status === 404) {
          record("smoke report cleanup", true, "already gone (404)");
        } else {
          let json = null;
          try {
            json = await res.json();
          } catch {
            json = null;
          }
          const retryable = res.status === 401 || res.status === 503;
          record(
            "smoke report cleanup",
            false,
            `HTTP ${res.status} ${JSON.stringify(json)} - row ${createdId} left in place`,
            retryable,
          );
        }
      } catch (err) {
        record("smoke report cleanup", false, `request failed: ${err.message} - row ${createdId} left in place`);
      }
    }
  }

  // 6. SSE connect frame (real-time surface alive post-cutover)
  try {
    const { frame } = await getFirstSseFrame(fetchImpl, `${config.api}/api/events`, 5000);
    let parsed = null;
    try {
      parsed = frame ? JSON.parse(frame) : null;
    } catch {
      parsed = null;
    }
    record(
      "SSE connect frame",
      parsed?.type === "connected",
      parsed?.type === "connected" ? "type=connected" : `frame=${JSON.stringify(frame)}`,
    );
  } catch (err) {
    record("SSE connect frame", false, `request failed: ${err.message}`);
  }

  return rows;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log(`Live smoke: api=${config.api} airport=${config.airport || "(auto)"} identity=${config.identity}`);
  const rows = await runChecks(config);
  for (const row of rows) {
    const tag = row.status === "fail" ? "FAIL" : row.status === "skip" ? "SKIP" : "OK  ";
    console.log(`${tag}  ${row.label} - ${row.detail}`);
  }
  const { verdict, passed, failed, skipped } = summarize(rows);
  console.log(`passed=${passed} failed=${failed} skipped=${skipped} -> ${verdict}`);
  if (config.report) {
    writeFileSync(
      config.report,
      JSON.stringify({ verdict, passed, failed, skipped, api: config.api, identity: config.identity, checks: rows }, null, 2),
    );
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
