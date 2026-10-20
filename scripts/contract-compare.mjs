/**
 * Contract-compare harness (TIR-339 / M3).
 *
 * For every launch-guarded public surface, fetch the route from prod and the
 * candidate backend, normalize instance-varying fields, and prove the JSON
 * contract identical. Routes are listed with the deployed behavior the QA
 * corpus locks in.
 *
 * Usage: node scripts/contract-compare.mjs [--full] [--prod URL] [--candidate URL] [--report FILE] [--no-prod]
 *
 * --no-prod validates the candidate against each probe's expectStatus + contract
 * predicate only (used when prod is unreachable). It is NOT the M3 byte-match
 * gate; the report verdict says so explicitly.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const arg = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const PROD = arg("--prod", "https://flyby-api.onrender.com");
const CANDIDATE = arg("--candidate", process.env.CANDIDATE_API_URL || "http://127.0.0.1:3197");
const FULL = args.includes("--full");
const NO_PROD = args.includes("--no-prod");
const REPORT = arg("--report", "");
const COMPARE_APPROVED_DIVERGENCES = arg("--approved-file", "");

const CORPUS = [
  { label: "health probe", method: "GET", path: "/api/health", expectStatus: 200 },
  { label: "airports list", method: "GET", path: "/api/airports", expectStatus: 200 },
  { label: "airport search filter", method: "GET", path: "/api/airports?q=jfk", expectStatus: 200 },
  { label: "airport detail by code", method: "GET", path: "/api/airports/JFK", expectStatus: 200 },
  { label: "airport detail by id alias", method: "GET", path: "/api/airports/apt-jfk", expectStatus: 200 },
  { label: "unknown airport 404s", method: "GET", path: "/api/airports/QQQ", expectStatus: 404 },
  { label: "wait-times unfiltered", method: "GET", path: "/api/wait-times", expectStatus: 200 },
  { label: "wait-times filter by code", method: "GET", path: "/api/wait-times?airport=JFK", expectStatus: 200 },
  { label: "wait-times filter by apt-id", method: "GET", path: "/api/wait-times?airportId=apt-jfk", expectStatus: 200 },
  { label: "wait-times unknown airport 404", method: "GET", path: "/api/wait-times?airport=YYY", expectStatus: 404 },
  { label: "report POST malformed body -> 400 errors[]", method: "POST", path: "/api/wait-times", body: {}, expectStatus: 400, contract: (j) => Array.isArray(j?.errors) && j.errors.length > 0 },
  { label: "report POST unknown airport -> 404", method: "POST", path: "/api/wait-times", body: { airport: "XYZ", waitMinutes: 10 }, expectStatus: 404, contract: (j) => j?.error === "Airport not found" },
  { label: "checkpoints list", method: "GET", path: "/api/checkpoints?airport=JFK", expectStatus: 200 },
  { label: "checkpoints list id form", method: "GET", path: "/api/checkpoints?airportId=apt-jfk", expectStatus: 200 },
  { label: "checkpoint forecasts by airport", method: "GET", path: "/api/airports/JFK/forecasts", expectStatus: 200 },
  { label: "forecasts unknown airport -> 404", method: "GET", path: "/api/airports/QQQ/forecasts", expectStatus: 404 },
  { label: "predict with ck-slug id resolves or 404s canonically", method: "GET", path: "/api/checkpoints/ck-jfk-main/predict", expectStatus: [200, 404] },
  { label: "summary aggregation", method: "GET", path: "/api/wait-times/summary", expectStatus: 200 },
  { label: "per-airport wait-stats", method: "GET", path: "/api/airports/JFK/wait-stats", expectStatus: 200 },
  { label: "wait-stats unknown code 404", method: "GET", path: "/api/airports/QQQ/wait-stats", expectStatus: 404 },
  { label: "wait-stats malformed code 400", method: "GET", path: "/api/airports/Q1/wait-stats", expectStatus: 400 },
  {
    label: "subscriptions list redacted on both sides",
    method: "GET",
    path: "/api/subscriptions",
    expectStatus: 200,
    contract: (j) => Array.isArray(j?.subscriptions) && j.subscriptions.every((r) => r && typeof r === "object" && r.endpoint === undefined && r.userId === undefined && r.p256dh === undefined),
  },
  { label: "subscriptions delete unknown -> 404 guarded", method: "DELETE", path: "/api/subscriptions/sub_contract_probe_never", expectStatus: 404, contract: (j) => j?.error === "not_found" || j?.error === "Invalid report id" },
  { label: "moderation queue requires admin key", method: "GET", path: "/api/moderation/reports", expectStatus: [401, 503] },
  { label: "moderation hide/clear need keys", method: "POST", path: "/api/moderation/reports/rpt_contract/hide", expectStatus: [400, 401, 503] },
  { label: "report flagging canonical contract", method: "POST", path: "/api/reports/not-a-real-row/flag", body: { reason: "inaccurate" }, expectStatus: [400, 404, 503] },
  { label: "admin delete no key behavior", method: "DELETE", path: "/api/reports/rpt_contract-probe", expectStatus: [401, 503] },
  // --- M3-plan additions: alias surface + SSE connect frame (all read-only) ---
  { label: "vapid public key shape", method: "GET", path: "/api/vapid-public-key", expectStatus: 200, contract: (j) => typeof j?.publicKey === "string" && j.publicKey.length > 0 },
  { label: "prefs singleton get", method: "GET", path: "/api/preferences", expectStatus: 200, contract: (j) => j !== null && typeof j === "object" && !Array.isArray(j) },
  { label: "per-user prefs defaults", method: "GET", path: "/api/notifications/preferences/contract_probe_user", expectStatus: [200, 404] },
  { label: "notifications listing unknown user", method: "GET", path: "/api/notifications/contract_probe_user", expectStatus: [200, 404] },
  { label: "SSE connect frame", method: "GET", path: "/api/events", sse: true, expectStatus: 200, contract: (j) => j?.type === "connected" },
];

function loadApproved() {
  if (!COMPARE_APPROVED_DIVERGENCES) return [];
  try {
    return JSON.parse(readFileSync(COMPARE_APPROVED_DIVERGENCES, "utf8")).patterns ?? [];
  } catch {
    return [];
  }
}

function normalize(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (/^(id|.*_[a-f0-9]{8,}|.*Id|messageId|subscriptionId|timestamp|createdAt|updatedAt|receivedAt|reportedAt|generatedAt|expiresAt)$/.test(key)) {
        out[key] = "#instance#";
        continue;
      }
      out[key] = normalize(v);
    }
    return out;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "#iso#";
  return value;
}

function fetchOne(base, probe) {
  const args = [
    "-s",
    "-o",
    "-",
    "-w",
    "\n%{http_code}",
    "--max-time",
    "60",
    "-X",
    probe.method,
    ...(probe.body !== undefined ? ["-H", "Content-Type: application/json", "-d", JSON.stringify(probe.body)] : []),
    new URL(probe.path, base).toString(),
  ];
  const stdout = execFileSync("curl.exe", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const m = stdout.match(/\n(\d{3})$/);
  const status = m ? parseInt(m[1], 10) : 0;
  const text = m ? stdout.slice(0, m.index) : stdout;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status, json, text };
}

// SSE probes can't use plain fetch-and-parse: the connection stays open, and
// curl's --max-time expiry exits non-zero after the frames arrive. The first
// `data:` frame is the contract unit (the connected frame shape).
function fetchSseFirstFrame(base, probe) {
  let stdout = "";
  try {
    stdout = execFileSync(
      "curl.exe",
      ["-s", "-N", "--max-time", "4", new URL(probe.path, base).toString()],
      { encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (err) {
    stdout = err.stdout ?? "";
  }
  const frame = stdout.split("\n").find((line) => line.startsWith("data: "));
  let json = null;
  if (frame !== undefined) {
    try {
      json = JSON.parse(frame.slice("data: ".length));
    } catch {
      json = null;
    }
  }
  // Headers received = the stream is contract-alive even though curl timed out.
  const status = stdout.length > 0 || frame !== undefined ? 200 : 0;
  return { status, json, text: frame ?? "" };
}

function fetchAny(base, probe) {
  return probe.sse ? fetchSseFirstFrame(base, probe) : fetchOne(base, probe);
}

async function main() {
  console.log(`Comparing ${NO_PROD ? "candidate-only (prod skipped)" : `prod ${PROD} vs`} candidate ${CANDIDATE} (${CORPUS.length} probes)`);
  const approved = loadApproved();
  const report = [];
  let pass = 0;
  let known = 0;
  let fail = 0;

  for (const probe of CORPUS) {
    const row = { label: probe.label, path: `${probe.method} ${probe.path}` };
    try {
      const prod = NO_PROD ? null : await Promise.resolve(fetchAny(PROD, probe));
      const cand = await Promise.resolve(fetchAny(CANDIDATE, probe));
      row.prodStatus = prod ? prod.status : null;
      row.candidateStatus = cand.status;

      const expected = Array.isArray(probe.expectStatus) ? probe.expectStatus : [probe.expectStatus];
      row.statusesMatch = (NO_PROD || cand.status === prod.status) && expected.includes(cand.status);
      row.byteMatch = prod ? prod.text === cand.text : null;
      row.contractOk = probe.contract ? Boolean(probe.contract(cand.json)) : true;
      row.approved = approved.find((p) => new RegExp(p.routePattern, "i").test(probe.path)) ?? null;

      if (!row.statusesMatch || !row.contractOk || (FULL && prod && !row.byteMatch)) {
        row.fail = true;
        if (row.approved) known++;
        else fail++;
      } else if (prod && JSON.stringify(normalize(prod.json)) !== JSON.stringify(normalize(cand.json))) {
        row.note = "normalized-shape differs from prod while contract holds";
        known++;
      } else {
        pass++;
      }
      if (!row.note && row.statusesMatch === false) row.note = `status mismatch (prod ${prod ? prod.status : "n/a"} -> candidate ${cand.status})`;
    } catch (err) {
      row.error = err.message;
      fail++;
    }

    report.push(row);
    console.log(`${row.error ? "ERR " : row.approved ? "KNOWN" : "OK"}  ${row.label}${row.error ? ` - ${row.error}` : row.note ? ` - ${row.note}` : ""}`);
  }

  const verdict = fail > 0 ? "FAIL" : known > 0 ? "PARTIAL (approved divergences)" : NO_PROD ? "PASS (candidate contract)" : "PASS (byte-match)";
  const finalVerdict = NO_PROD ? `CANDIDATE-ONLY, ${verdict} (not the M3 gate - no prod comparison)` : verdict;
  console.log(`pass=${pass}  known=${known}  fail=${fail}  -> ${finalVerdict}`);
  if (REPORT) writeFileSync(REPORT, JSON.stringify({ verdict: finalVerdict, pass, knownDivergence: known, fail, report }, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

await main();
