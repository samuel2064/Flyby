'use strict';

// TIR-298 regression suite: GET /api/wait-times must never fabricate records.
// Runs in in-memory mode (no database) with Node's built-in test runner, so
// `npm test` works with only production dependencies installed.

delete process.env.DATABASE_URL; // force in-memory mode: deterministic, no DB
process.env.PORT = '3787'; // dedicated test port; CI boot check uses 3000

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const { httpServer, computeForecast, checkpointIdFor, findCheckpointById } = require('./server.js');

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
  assert.equal(body.data.forecasts.length, 1);
  const forecast = body.data.forecasts[0];
  assert.equal(forecast.checkpointId, 'ck-jfk-main');
  assert.equal(forecast.name, 'Main');
  assert.equal(forecast.code, null);
  assert.equal(forecast.terminal, null);
  // No persisted reports -> empty forecast, never fabricated values (TIR-298 trust principle)
  assert.equal(forecast.sampleCount, 0);
  assert.deepEqual(forecast.predictions, []);
  assert.deepEqual(forecast.bestHours, []);
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
