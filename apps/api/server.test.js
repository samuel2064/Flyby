'use strict';

// TIR-298 regression suite: GET /api/wait-times must never fabricate records.
// Runs in in-memory mode (no database) with Node's built-in test runner, so
// `npm test` works with only production dependencies installed.

delete process.env.DATABASE_URL; // force in-memory mode: deterministic, no DB
process.env.PORT = '3787'; // dedicated test port; CI boot check uses 3000
process.env.SSE_KEEPALIVE_MS = '250'; // make keepalive frames observable in tests

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { httpServer, computeForecast, checkpointIdFor, findCheckpointById, bucketWaitHistory } =
  require('./server.js');
const sharedData = require('../../data/airports.json');

const BASE = `http://127.0.0.1:${process.env.PORT}`;

const ready = new Promise((resolve) => {
  if (httpServer.listening) return resolve();
  httpServer.once('listening', resolve);
});

after(() => new Promise((resolve) => httpServer.close(() => resolve())));

test('unknown airport code returns 404 Airport not found', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airport=YYY`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Airport not found' });
});

test('unknown airportId returns 404 Airport not found', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airportId=apt-zzz`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Airport not found' });
});

test('known airport with no reports returns empty list, never a fabricated record', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airport=SEA`);
  assert.equal(res.status, 200);
  // Before TIR-298 this fabricated [{airport:'SEA',checkpoint:'Main',waitMinutes:12,updatedAt:<now>}]
  assert.deepEqual(await res.json(), []);
});

test('known airport codes are case-insensitive (jfk)', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airport=jfk`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('airportId accepts the airport id (apt-jfk) as well as the code', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airportId=apt-jfk`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('whitespace-padded known code is accepted', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airport=${encodeURIComponent(' sea ')}`);
  assert.equal(res.status, 200);
});

test('no filter returns 200 with an array (no fabricated default airport)', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('health endpoint still responds ok (boot sanity)', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

// --- TIR-299: authenticated DELETE /api/reports/:id ---------------------------
// In-memory mode (no DB): reports are never persisted, so an authenticated
// delete of a well-formed id answers 404 "Report not found" - distinct from the
// catch-all 404 {"error":"not_found","path":...} that a missing route returns.

const ADMIN_KEY = 'test-admin-key-0123456789abcdef';

test('DELETE /api/reports/:id without a key returns 401 (route exists, not catch-all)', async () => {
  await ready;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const res = await fetch(`${BASE}/api/reports/rpt_1234567890`, { method: 'DELETE' });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Invalid or missing admin key' });
});

test('DELETE /api/reports/:id with a wrong key returns 401', async () => {
  await ready;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const res = await fetch(`${BASE}/api/reports/rpt_1234567890`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': 'not-the-admin-key' },
  });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Invalid or missing admin key' });
});

test('DELETE /api/reports/:id accepts Authorization: Bearer auth', async () => {
  await ready;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const res = await fetch(`${BASE}/api/reports/rpt_1234567890`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ADMIN_KEY}` },
  });
  // 404 "Report not found": authenticated, in-memory mode has no persisted rows
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Report not found' });
});

test('authenticated DELETE with X-Admin-Key and unknown id returns 404 Report not found', async () => {
  await ready;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const res = await fetch(`${BASE}/api/reports/rpt_1234567890`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Report not found' });
});

test('authenticated DELETE with an invalid id format returns 400', async () => {
  await ready;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const res = await fetch(`${BASE}/api/reports/bad%20id%21`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid report id' });
});

test('authenticated DELETE with an oversized id returns 400', async () => {
  await ready;
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const longId = 'a'.repeat(65);
  const res = await fetch(`${BASE}/api/reports/${longId}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': ADMIN_KEY },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid report id' });
});

test('DELETE /api/reports/:id is fail-closed (503) when ADMIN_API_KEY is unset', async () => {
  await ready;
  delete process.env.ADMIN_API_KEY;
  try {
    const res = await fetch(`${BASE}/api/reports/rpt_1234567890`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': 'anything' },
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'Report deletion is disabled: ADMIN_API_KEY is not configured');
  } finally {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  }
});

// --- TIR-300: pattern-based wait-time forecasts ---------------------------------
// In-memory mode persists no reports, so the HTTP tests cover validation,
// 404s, and the empty-data no-fabrication shape. The forecast math itself
// (hour bucketing, live blending, best-hours ranking) is unit-tested against
// computeForecast directly below.

test('predict returns the full forecast shape for a known checkpoint id', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-main/predict`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    data: {
      checkpointId: 'ck-jfk-main',
      airportCode: 'JFK',
      airportName: 'John F. Kennedy International',
      code: null,
      name: 'Main',
      terminal: null,
      historyDays: 30,
      horizon: 12,
      timezone: 'America/New_York',
      sampleCount: 0,
      overallAverageMinutes: null,
      currentConsensusMinutes: null,
      liveConsensusMinutes: null,
      predictions: [],
      bestHours: [],
    },
  });
});

test('predict echoes explicit horizon and days', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-main/predict?horizon=5&days=7`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.horizon, 5);
  assert.equal(body.data.historyDays, 7);
});

test('predict returns 404 for an unknown well-formed checkpoint id', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-north-terminal-2/predict`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Checkpoint not found' });
});

test('predict returns 400 for a malformed checkpoint id', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/Main%20Checkpoint/predict`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid checkpoint id' });
});

test('predict rejects an out-of-range or non-integer horizon', async () => {
  await ready;
  for (const horizon of ['0', '25', 'abc', '-1']) {
    const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-main/predict?horizon=${horizon}`);
    assert.equal(res.status, 400, `horizon=${horizon}`);
    assert.deepEqual(await res.json(), {
      error: 'horizon must be a positive integer between 1 and 24',
    });
  }
});

test('predict rejects an out-of-range days window', async () => {
  await ready;
  for (const days of ['0', '31', 'abc']) {
    const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-main/predict?days=${days}`);
    assert.equal(res.status, 400, `days=${days}`);
    assert.deepEqual(await res.json(), {
      error: 'days must be a positive integer between 1 and 30',
    });
  }
});

test('batch forecasts return one forecast per checkpoint for a known airport', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/airports/JFK/forecasts`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.airportCode, 'JFK');
  assert.equal(body.data.airportName, 'John F. Kennedy International');
  assert.equal(body.data.timezone, 'America/New_York');
  assert.equal(body.data.historyDays, 30);
  assert.equal(body.data.horizon, 12);
  // One forecast per configured checkpoint (TIR-313: JFK now carries its real
  // terminal checkpoints in addition to the launch-era 'Main').
  const jfkCheckpoints = sharedData.checkpointsByAirport.JFK;
  assert.equal(body.data.forecasts.length, jfkCheckpoints.length);
  assert.ok(body.data.forecasts.length >= 1);
  const main = body.data.forecasts.find((f) => f.checkpointId === 'ck-jfk-main');
  assert.ok(main, 'ck-jfk-main forecast must be present');
  assert.equal(main.name, 'Main');
  assert.equal(main.code, null);
  assert.equal(main.terminal, null);
  // No persisted reports -> empty forecast, never fabricated values (TIR-298 trust principle)
  assert.equal(main.sampleCount, 0);
  assert.deepEqual(main.predictions, []);
  assert.deepEqual(main.bestHours, []);
});

test('batch forecasts normalize lowercase airport codes', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/airports/jfk/forecasts`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.airportCode, 'JFK');
});

test('batch forecasts use the airport timezone for bucketing', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/airports/SEA/forecasts`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.timezone, 'America/Los_Angeles');
  assert.equal(body.data.forecasts[0].timezone, 'America/Los_Angeles');
});

test('batch forecasts return 404 for an unknown airport code', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/airports/QQQ/forecasts`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Airport not found' });
});

test('batch forecasts return 400 for an invalid airport code format', async () => {
  await ready;
  for (const code of ['1A', 'AB', 'toolong']) {
    const res = await fetch(`${BASE}/api/airports/${code}/forecasts`);
    assert.equal(res.status, 400, `code=${code}`);
    assert.deepEqual(await res.json(), {
      error: 'Invalid airport code. Must be a 3-letter IATA code.',
    });
  }
});

test('batch forecasts reject invalid horizon and days', async () => {
  await ready;
  const badHorizon = await fetch(`${BASE}/api/airports/JFK/forecasts?horizon=25`);
  assert.equal(badHorizon.status, 400);
  assert.deepEqual(await badHorizon.json(), {
    error: 'horizon must be a positive integer between 1 and 24',
  });
  const badDays = await fetch(`${BASE}/api/airports/JFK/forecasts?days=0`);
  assert.equal(badDays.status, 400);
  assert.deepEqual(await badDays.json(), {
    error: 'days must be a positive integer between 1 and 30',
  });
});

test('batch forecasts and single predict share the same core (parity)', async () => {
  await ready;
  const [batch, single] = await Promise.all([
    fetch(`${BASE}/api/airports/JFK/forecasts?horizon=7&days=3`).then((r) => r.json()),
    fetch(`${BASE}/api/checkpoints/ck-jfk-main/predict?horizon=7&days=3`).then((r) => r.json()),
  ]);
  const forecast = batch.data.forecasts.find((f) => f.checkpointId === 'ck-jfk-main');
  assert.ok(forecast, 'batch must include ck-jfk-main');
  // The core fields must be identical: both endpoints call the same
  // computeForecast, so batch and single results can never diverge.
  for (const key of [
    'timezone',
    'sampleCount',
    'overallAverageMinutes',
    'currentConsensusMinutes',
    'liveConsensusMinutes',
    'predictions',
    'bestHours',
  ]) {
    assert.deepEqual(forecast[key], single.data[key], `parity on ${key}`);
  }
});

test('checkpoint ids are deterministic slugs and resolve back to checkpoints', () => {
  assert.equal(checkpointIdFor('JFK', 'Main'), 'ck-jfk-main');
  assert.equal(checkpointIdFor('ORD', 'Terminal 2'), 'ck-ord-terminal-2');
  const resolved = findCheckpointById('ck-sea-main');
  assert.equal(resolved.airport.code, 'SEA');
  assert.equal(resolved.name, 'Main');
  assert.equal(findCheckpointById('ck-jfk-north'), null);
});

// --- TIR-300: computeForecast unit tests (the forecast math itself) -------------

// A report `daysAgo` at the given UTC hour.
function reportAt(daysAgo, utcHour, minutes) {
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  at.setUTCHours(utcHour, 0, 0, 0);
  return { minutes, reportedAt: at };
}

test('computeForecast with no reports returns an empty forecast, never fabricated values', () => {
  const core = computeForecast('UTC', [], 12);
  assert.equal(core.timezone, 'UTC');
  assert.equal(core.sampleCount, 0);
  assert.equal(core.overallAverageMinutes, null);
  assert.equal(core.currentConsensusMinutes, null);
  assert.equal(core.liveConsensusMinutes, null);
  assert.deepEqual(core.predictions, []);
  assert.deepEqual(core.bestHours, []);
});

test('computeForecast bucketizes hour-of-day history in the airport timezone', () => {
  // Deterministic upcoming hours (same trick as the monorepo suite): reports
  // at (now+20)%24 and (now+21)%24 two days ago always fall inside horizon=24
  // regardless of wall-clock, and stay outside both consensus windows.
  const now = new Date();
  const hourA = (now.getUTCHours() + 20) % 24; // 2 reports {10,20} -> pattern avg 15
  const hourB = (now.getUTCHours() + 21) % 24; // 4 reports {40,44,46,50} -> pattern avg 45
  const waitTimes = [
    reportAt(2, hourA, 10),
    reportAt(2, hourA, 20),
    reportAt(2, hourB, 40),
    reportAt(2, hourB, 44),
    reportAt(2, hourB, 46),
    reportAt(2, hourB, 50),
  ];
  const core = computeForecast('UTC', waitTimes, 24);

  assert.equal(core.sampleCount, 6);
  assert.equal(core.overallAverageMinutes, 35); // (10+20+40+44+46+50)/6
  assert.equal(core.currentConsensusMinutes, null); // all reports are 2 days old
  assert.equal(core.liveConsensusMinutes, null);

  const predA = core.predictions.find((p) => p.hour === hourA);
  assert.equal(predA.source, 'pattern');
  assert.equal(predA.predictedMinutes, 15);
  assert.equal(predA.sampleCount, 2);
  assert.equal(predA.confidence, 0.2); // min(1, 2/10)

  const predB = core.predictions.find((p) => p.hour === hourB);
  assert.equal(predB.source, 'pattern');
  assert.equal(predB.predictedMinutes, 45);
  assert.equal(predB.sampleCount, 4);
  assert.equal(predB.confidence, 0.4); // min(1, 4/10)

  // Hours with no history fall back to the overall average at halved confidence.
  const hourC = (now.getUTCHours() + 2) % 24;
  const predC = core.predictions.find((p) => p.hour === hourC);
  assert.equal(predC.source, 'fallback');
  assert.equal(predC.predictedMinutes, 35);
  assert.equal(predC.sampleCount, 0);
  assert.equal(predC.confidence, 0.3); // round(min(1, 6/10) * 0.5 * 100) / 100

  // bestHours: only pattern-backed hours, sorted by predicted wait.
  assert.equal(core.bestHours.length, 2);
  assert.equal(core.bestHours[0].hour, hourA);
  assert.equal(core.bestHours[0].predictedMinutes, 15);
  assert.equal(core.bestHours[1].hour, hourB);
  assert.equal(core.bestHours[1].predictedMinutes, 45);
});

test('computeForecast blends live consensus into the imminent slots without double-counting', () => {
  const currentHour = new Date().getUTCHours();
  const waitTimes = [
    // History at the current hour: the live reports must NOT add to this bucket.
    reportAt(2, currentHour, 50),
    // Two fresh identical live reports (within the 60-minute window) -> exact
    // live consensus of 100.
    { minutes: 100, reportedAt: new Date(Date.now() - 5 * 60 * 1000) },
    { minutes: 100, reportedAt: new Date(Date.now() - 10 * 60 * 1000) },
  ];
  const core = computeForecast('UTC', waitTimes, 12);

  assert.equal(core.liveConsensusMinutes, 100);
  assert.equal(core.currentConsensusMinutes, 100); // only live reports are within 6h

  const [slot0, slot1, slot2] = core.predictions;
  // Slot 0 (current hour): 60% live + 40% pattern. Pattern = 50 (the single
  // history report; the live reports were excluded from the bucket).
  assert.equal(slot0.source, 'blended');
  assert.equal(slot0.predictedMinutes, 80); // round(0.6*100 + 0.4*50)
  assert.equal(slot0.sampleCount, 1); // no double-count: history only
  assert.equal(slot0.confidence, 0.3); // min(1, (1 pattern + 2 live)/10)

  // Slot 1 (next hour): 30% live + 70% pattern. No history at that hour, so
  // the pattern is the overall average (50+100+100)/3 = 83.3.
  assert.equal(slot1.source, 'blended');
  assert.equal(slot1.predictedMinutes, 88); // round(0.3*100 + 0.7*83.33)

  // Slot 2 onward: pure pattern. No history there -> fallback, never blended.
  assert.equal(slot2.source, 'fallback');

  // Blended slots are backed by real evidence and may appear in bestHours.
  for (const best of core.bestHours) {
    const matching = core.predictions.find((p) => p.hour === best.hour);
    assert.ok(matching && matching.source !== 'fallback');
  }
});

// --- TIR-313: 51-airport expansion (shared data/airports.json) ----------------

test('GET /api/airports returns the full expanded list (51) with complete shape', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/airports`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.airports));
  assert.equal(body.airports.length, 51);
  for (const a of body.airports) {
    assert.ok(a.id && typeof a.id === 'string', `airport ${a.code} needs id`);
    assert.match(a.code, /^[A-Z]{3}$/);
    assert.ok(a.name && a.city && a.timezone);
  }
  const jfk = body.airports.find((a) => a.code === 'JFK');
  assert.equal(jfk.id, 'apt-jfk');
  assert.equal(jfk.name, 'John F. Kennedy International');
  assert.equal(jfk.timezone, 'America/New_York');
  // Expansion unlock: ATL (and the other 45 new airports) are first-class now.
  assert.ok(body.airports.some((a) => a.code === 'ATL'));
});

test('GET /api/airports?q= filters across the expanded list', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/airports?q=atlanta`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.airports.length, 1);
  assert.equal(body.airports[0].code, 'ATL');
});

test('expanded airports are canonical: wait-times no longer 404s for ATL', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airport=ATL`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('GET /api/checkpoints exposes real checkpoint names for expanded airports', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints?airport=ATL`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.airport, 'ATL');
  assert.ok(body.checkpoints.length >= 4);
  assert.ok(body.checkpoints.some((c) => c.name === 'Domestic North Checkpoint A'));

  const all = await fetch(`${BASE}/api/checkpoints`);
  const allBody = await all.json();
  const expectedTotal = Object.values(sharedData.checkpointsByAirport).reduce(
    (sum, list) => sum + list.length, 0);
  assert.equal(allBody.checkpoints.length, expectedTotal);
});

test('launch airports keep their Main checkpoint so production reports stay valid', async () => {
  for (const code of ['JFK', 'SEA', 'LAX', 'ORD', 'SFO']) {
    const names = sharedData.checkpointsByAirport[code];
    assert.equal(names[0], 'Main', `${code} must keep Main first`);
    assert.equal(checkpointIdFor(code, 'Main'), `ck-${code.toLowerCase()}-main`);
    const found = findCheckpointById(`ck-${code.toLowerCase()}-main`);
    assert.ok(found, `ck-${code.toLowerCase()}-main must resolve`);
  }
});

test('stable checkpoint ids derive for real multi-word checkpoint names', async () => {
  const id = 'ck-atl-domestic-north-checkpoint-a';
  const found = findCheckpointById(id);
  assert.ok(found);
  assert.equal(found.airport.code, 'ATL');
  assert.equal(found.name, 'Domestic North Checkpoint A');
});

test('predict for a report-less expanded checkpoint returns empty predictions (no fabrication)', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/ck-atl-domestic-north-checkpoint-a/predict`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.sampleCount, 0);
  assert.deepEqual(body.data.predictions, []);
  assert.deepEqual(body.data.bestHours, []);
  assert.equal(body.data.checkpointId, 'ck-atl-domestic-north-checkpoint-a');
});

test('apt-id lookups work for every supported airport, not just the launch five', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times?airportId=apt-atl`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
  const byCode = await fetch(`${BASE}/api/airports/atL`);
  assert.equal(byCode.status, 200);
  assert.equal((await byCode.json()).code, 'ATL');
});

// --- TIR-314: the SSE stream carries only REAL wait-time updates ----------------
// The old handler emitted a fabricated {checkpoint:'Main', waitMinutes:random}
// frame every 2 seconds - overwriting real reports and inventing data at
// report-less airports. Now the stream is quiet until a real report is
// accepted, and accepted reports fan out to the subscribed clients.

// Minimal SSE client over fetch: parses `data:` frames off the raw stream.
// `close()` aborts the underlying connection so the test server can shut down.
function openSSE(airport) {
  const controller = new AbortController();
  const events = [];
  const connected = (async () => {
    const query = airport ? `?airport=${encodeURIComponent(airport)}` : '';
    const res = await fetch(`${BASE}/api/events${query}`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    (async () => {
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            // Only `data:` lines carry events; keepalive comments (": ping") are
            // intentionally ignored here, exactly like EventSource does.
            for (const line of frame.split('\n')) {
              if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
            }
          }
        }
      } catch {
        // aborted by close()
      }
    })();
    return res;
  })();
  return {
    events,
    connected,
    async waitFor(predicate, timeoutMs) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const hit = events.find(predicate);
        if (hit) return hit;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return events.find(predicate) || null;
    },
    async collectQuietly(durationMs) {
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      return events;
    },
    close() {
      controller.abort();
    },
  };
}

test('SSE opens with a connected event and then stays quiet - no fabricated updates', async () => {
  await ready;
  // ATL is canonical but report-less in in-memory mode: the stream must show
  // the honest empty state, not invented numbers.
  const client = openSSE('ATL');
  try {
    const connected = await client.waitFor((ev) => ev.type === 'connected', 5000);
    assert.ok(connected, 'connected frame must arrive');
    assert.ok(!isNaN(Date.parse(connected.timestamp)), 'connected carries an ISO timestamp');
    // The old implementation fabricated a wait-time-update every 2s; watching
    // for longer than that interval is the regression guard.
    const events = await client.collectQuietly(2600);
    assert.ok(
      !events.some((ev) => ev.type === 'wait-time-update'),
      `stream must not fabricate wait-time-update frames, got: ${JSON.stringify(events.filter((e) => e.type === 'wait-time-update'))}`,
    );
  } finally {
    client.close();
  }
});

test('accepted reports fan out over SSE to subscribed and unfiltered clients only', async () => {
  await ready;
  const jfk = openSSE('JFK');
  const sea = openSSE('SEA');
  const unfiltered = openSSE(null);
  try {
    await Promise.all([
      jfk.waitFor((ev) => ev.type === 'connected', 5000),
      sea.waitFor((ev) => ev.type === 'connected', 5000),
      unfiltered.waitFor((ev) => ev.type === 'connected', 5000),
    ]);

    const res = await fetch(`${BASE}/api/wait-times`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'sse-fanout-user-1' },
      body: JSON.stringify({
        airport: 'JFK',
        checkpoint: 'Terminal 4 Security',
        waitMinutes: 37,
      }),
    });
    assert.equal(res.status, 201);

    const onJfk = await jfk.waitFor(
      (ev) => ev.type === 'wait-time-update' && ev.checkpoint === 'Terminal 4 Security',
      5000,
    );
    assert.ok(onJfk, 'JFK-subscribed client must receive the real report');
    assert.equal(onJfk.airport, 'JFK');
    assert.equal(onJfk.waitMinutes, 37);
    assert.ok(!isNaN(Date.parse(onJfk.timestamp)), 'update carries the report timestamp');

    const onUnfiltered = await unfiltered.waitFor(
      (ev) => ev.type === 'wait-time-update' && ev.checkpoint === 'Terminal 4 Security',
      5000,
    );
    assert.ok(onUnfiltered, 'unfiltered client must receive the real report');
    assert.equal(onUnfiltered.waitMinutes, 37);

    // Airport filtering: SEA subscribers must not see JFK's report.
    const seaEvents = await sea.collectQuietly(600);
    assert.ok(
      !seaEvents.some((ev) => ev.type === 'wait-time-update'),
      'SEA-subscribed client must not receive JFK updates',
    );
  } finally {
    jfk.close();
    sea.close();
    unfiltered.close();
  }
});

test('reports for unknown airports are rejected at the boundary (404, never persisted or broadcast)', async () => {
  await ready;
  const client = openSSE(null);
  try {
    await client.waitFor((ev) => ev.type === 'connected', 5000);
    const before = client.events.length;

    const res = await fetch(`${BASE}/api/wait-times`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'sse-unknown-airport-user' },
      body: JSON.stringify({ airport: 'QALOCAL', checkpoint: 'Main', waitMinutes: 10 }),
    });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Airport not found' });

    const events = await client.collectQuietly(500);
    assert.equal(events.length, before, 'rejected reports must not be broadcast');
  } finally {
    client.close();
  }
});

test('report waitMinutes is bounded to 1-300', async () => {
  await ready;
  for (const minutes of [301, 0, -5]) {
    const res = await fetch(`${BASE}/api/wait-times`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': `sse-bounds-user-${minutes}` },
      body: JSON.stringify({ airport: 'JFK', checkpoint: 'Main', waitMinutes: minutes }),
    });
    assert.equal(res.status, 400, `waitMinutes=${minutes}`);
    const body = await res.json();
    assert.ok(Array.isArray(body.errors));
    assert.ok(body.errors.some((e) => e.field === 'waitMinutes'));
  }
});

test('accepted report responses carry the canonical uppercase airport code', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/wait-times`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'sse-canonical-user' },
    body: JSON.stringify({ airport: 'jfk', checkpoint: 'Main', waitMinutes: 12 }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.airport, 'JFK');
  assert.equal(body.checkpoint, 'Main');
  assert.equal(body.waitMinutes, 12);
  assert.ok(body.id && body.receivedAt);
});

// --- GET /api/checkpoints/:id/history (checkpoint chart) ----------------------

const BASE_TS = Date.parse('2026-09-23T12:00:00Z');
function historyReports(...specs) {
  // [minutesAgo, waitMinutes]
  return specs.map(([minutesAgo, waitMinutes]) => ({
    minutes: waitMinutes,
    reportedAt: new Date(BASE_TS - minutesAgo * 60 * 1000),
  }));
}

test('bucketWaitHistory returns empty for no reports (never fabricated)', () => {
  assert.deepEqual(bucketWaitHistory([], 30), []);
  assert.deepEqual(bucketWaitHistory(undefined, 30), []);
});

test('bucketWaitHistory averages reports in the same epoch-aligned bucket', () => {
  const result = bucketWaitHistory(historyReports([25, 10], [10, 20]), 30);
  assert.deepEqual(result, [{ time: '2026-09-23T11:30:00.000Z', minutes: 15, count: 2 }]);
});

test('bucketWaitHistory rounds bucket averages and carries per-bucket counts', () => {
  const result = bucketWaitHistory(historyReports([25, 10], [10, 21]), 30);
  // (10 + 21) / 2 = 15.5 -> 16
  assert.deepEqual(result, [{ time: '2026-09-23T11:30:00.000Z', minutes: 16, count: 2 }]);
});

test('bucketWaitHistory separates distinct buckets and sorts ascending', () => {
  const unordered = [
    { minutes: 30, reportedAt: new Date(BASE_TS - 5 * 60 * 1000) }, // 11:55 -> 11:30 bucket
    { minutes: 10, reportedAt: new Date(BASE_TS - 40 * 60 * 1000) }, // 11:20 -> 11:00 bucket
    { minutes: 12, reportedAt: new Date(BASE_TS - 25 * 60 * 1000) }, // 11:35 -> 11:30 bucket
  ];
  const result = bucketWaitHistory(unordered, 30);
  assert.deepEqual(result, [
    { time: '2026-09-23T11:00:00.000Z', minutes: 10, count: 1 },
    { time: '2026-09-23T11:30:00.000Z', minutes: 21, count: 2 },
  ]);
});

test('bucketWaitHistory honors custom bucket sizes', () => {
  const result = bucketWaitHistory(historyReports([25, 10], [5, 20]), 10);
  assert.deepEqual(result, [
    { time: '2026-09-23T11:30:00.000Z', minutes: 10, count: 1 },
    { time: '2026-09-23T11:50:00.000Z', minutes: 20, count: 1 },
  ]);
});

test('bucketWaitHistory accepts ISO strings as well as Dates', () => {
  const result = bucketWaitHistory(
    [{ minutes: 10, reportedAt: '2026-09-23T11:35:00.000Z' }],
    30,
  );
  assert.deepEqual(result, [{ time: '2026-09-23T11:30:00.000Z', minutes: 10, count: 1 }]);
});

test('bucketWaitHistory skips reports with unparsable timestamps', () => {
  const good = { minutes: 10, reportedAt: new Date(BASE_TS) };
  const bad = { minutes: 50, reportedAt: 'not-a-date' };
  assert.deepEqual(bucketWaitHistory([good, bad], 30), [
    { time: '2026-09-23T12:00:00.000Z', minutes: 10, count: 1 },
  ]);
});

test('bucketWaitHistory rejects unsupported bucket sizes', () => {
  assert.throws(() => bucketWaitHistory([], 7));
  assert.throws(() => bucketWaitHistory([], 0));
});

test('history endpoint returns 400 for a malformed checkpoint id', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/Main%20Checkpoint/history`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid checkpoint id' });
});

test('history endpoint returns 404 for an unknown well-formed checkpoint id', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-north-terminal-2/history`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Checkpoint not found' });
});

test('history endpoint returns an empty (never fabricated) history for a known checkpoint', async () => {
  await ready;
  const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-main/history`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.checkpointId, 'ck-jfk-main');
  assert.equal(body.data.airportCode, 'JFK');
  assert.equal(body.data.name, 'Main');
  assert.equal(body.data.windowHours, 4);
  assert.equal(body.data.bucketMinutes, 30);
  assert.equal(body.data.reportCount, 0); // in-memory mode persists nothing
  assert.deepEqual(body.data.history, []);
});

test('history endpoint validates the window and bucket query parameters', async () => {
  await ready;
  for (const qs of ['window=0', 'window=25', 'window=abc', 'bucket=7', 'bucket=120', 'bucket=xyz']) {
    const res = await fetch(`${BASE}/api/checkpoints/ck-jfk-main/history?${qs}`);
    assert.equal(res.status, 400, qs);
    const body = await res.json();
    assert.ok(typeof body.error === 'string' && body.error.length > 0, qs);
  }
  const ok = await fetch(`${BASE}/api/checkpoints/ck-jfk-main/history?window=6&bucket=15`);
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.equal(okBody.data.windowHours, 6);
  assert.equal(okBody.data.bucketMinutes, 15);
});

// --- TIR-314 regression: SSE streams real reports only, never fabricated ----
// Before TIR-314 the stream ticked out RANDOM wait-time updates. These tests
// lock in: connect frame only until a real report lands; real reports reach
// scoped clients with the exact payload; other airports stay silent; unscoped
// clients receive everything; keepalive comments never surface as events.

// Collects parsed data-frames (keepalive/comment frames excluded, exactly as
// EventSource sees them). If predicate(ev) returns true the stream closes
// early; otherwise collection ends after timeoutMs and resolves with events.
function collectSseEvents(path, timeoutMs, predicate) {
  return new Promise((resolve, reject) => {
    const events = [];
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(events); } };
    const req = http.get(`${BASE}${path}`, (res) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'text/event-stream');
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!frame.trim() || frame.startsWith(':')) continue; // keepalive
          for (const line of frame.split('\n')) {
            if (line.startsWith('data:')) {
              const ev = JSON.parse(line.slice(5).trim());
              events.push(ev);
              if (predicate && predicate(ev)) { req.destroy(); return done(); }
            }
          }
        }
      });
      res.on('end', done);
      res.on('error', done);
    });
    req.on('error', (err) => (finished ? done() : reject(err)));
    setTimeout(() => { req.destroy(); done(); }, timeoutMs).unref();
  });
}

// Same loop but returns the raw text so keepalive comments can be asserted
// (they keep the connection alive through proxies but must stay invisible to
// event consumers).
function collectSseRaw(path, timeoutMs) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(raw); } };
    const req = http.get(`${BASE}${path}`, (res) => {
      res.on('data', (chunk) => { raw += chunk.toString(); });
      res.on('end', done);
      res.on('error', done);
    });
    req.on('error', (err) => (finished ? done() : reject(err)));
    setTimeout(() => { req.destroy(); done(); }, timeoutMs).unref();
  });
}

const postReport = (identity, report) =>
  fetch(`${BASE}/api/wait-times`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': identity },
    body: JSON.stringify(report),
  });

test('SSE connect sends a connected frame and never fabricated wait-time events', async () => {
  await ready;
  // No reports are posted while this collection runs (serial suite, earlier
  // POST tests are finished) - any wait-time-update here would be fabricated.
  const events = await collectSseEvents('/api/events?airport=SEA', 700);
  assert.ok(events.some((e) => e.type === 'connected'), 'expected a connected frame');
  assert.equal(
    events.filter((e) => e.type === 'wait-time-update').length,
    0,
    'stream must stay silent (no fabricated updates) until a real report lands',
  );
});

test('a real report reaches scoped clients with the exact payload', async () => {
  await ready;
  const collected = collectSseEvents(
    '/api/events?airport=SEA',
    4000,
    (ev) => ev.type === 'wait-time-update',
  );
  await new Promise((r) => setTimeout(r, 150)); // let the subscription register
  const post = await postReport('sse-stream-test-1', { airport: 'SEA', checkpoint: 'Main', waitMinutes: 22 });
  assert.equal(post.status, 201);
  const events = await collected;
  const update = events.find((e) => e.type === 'wait-time-update');
  assert.ok(update, 'client must receive the broadcast');
  assert.equal(update.airport, 'SEA');
  assert.equal(update.checkpoint, 'Main');
  assert.equal(update.waitMinutes, 22);
  assert.ok(update.timestamp, 'broadcast carries the acceptance timestamp');
});

test("broadcasts are scoped: a client subscribed to another airport hears nothing", async () => {
  await ready;
  const collected = collectSseEvents('/api/events?airport=LAX', 900);
  await new Promise((r) => setTimeout(r, 150));
  const post = await postReport('sse-stream-test-2', { airport: 'JFK', checkpoint: 'Main', waitMinutes: 33 });
  assert.equal(post.status, 201);
  const events = await collected;
  assert.equal(
    events.filter((e) => e.type === 'wait-time-update').length,
    0,
    'an LAX subscriber must not receive JFK updates',
  );
});

test('unscoped clients receive every airports broadcast', async () => {
  await ready;
  const collected = collectSseEvents('/api/events', 4000, (ev) => ev.type === 'wait-time-update');
  await new Promise((r) => setTimeout(r, 150));
  const post = await postReport('sse-stream-test-3', { airport: 'JFK', checkpoint: 'Main', waitMinutes: 14 });
  assert.equal(post.status, 201);
  const events = await collected;
  const update = events.find((e) => e.type === 'wait-time-update');
  assert.ok(update && update.airport === 'JFK');
});

test('keepalive comments arrive on the wire but stay invisible to event consumers', async () => {
  await ready;
  const raw = await collectSseRaw('/api/events?airport=SEA', 700);
  assert.ok(raw.includes(': ping'), 'keepalive frames must keep Render idle-out away');
  const events = await collectSseEvents('/api/events?airport=SEA', 700);
  assert.ok(events.every((e) => e.type === 'connected'), 'keepalives parse as comments, not events');
});
