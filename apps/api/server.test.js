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
