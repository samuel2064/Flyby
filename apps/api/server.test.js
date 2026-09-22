'use strict';

// TIR-298 regression suite: GET /api/wait-times must never fabricate records.
// Runs in in-memory mode (no database) with Node's built-in test runner, so
// `npm test` works with only production dependencies installed.

delete process.env.DATABASE_URL; // force in-memory mode: deterministic, no DB
process.env.PORT = '3787'; // dedicated test port; CI boot check uses 3000

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const { httpServer } = require('./server.js');

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
