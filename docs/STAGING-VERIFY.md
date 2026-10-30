# Staging Verification

**Status:** ready to run once the staging pair exists (blocked on Render Blueprint import — TIR-29, TIR-345)
**Owner:** Founding Engineer (TIR-339)
**Companion docs:** `docs/LAUNCH-CHECKLIST.md` (sequence), `docs/M2-POSTGRES-RUNBOOK.md` (deploy + data migration), `render.yaml` (service definitions)

This is the authoritative staging checklist. It covers the fast pre-flight that
must pass **before** the M3 byte-compare gate and QA sign-off. It is one command
backed by `scripts/staging-verify.mjs`.

## What it proves

A staging deployment is:

1. **alive** — `/api/health` returns `{ status: "ok", services: { database: "ok", redis: "ok" } }`
2. **PRODUCTION-configured** — `health.environment === "production"` (catches a staging deploy left on `development` / `MOCK_REDIS`)
3. **seeded** — `>= 51` airports, every id in the `apt-<3 letters>` form
4. **contract-shaped** — `apt-` id resolution (`/api/airports/apt-jfk`), `ck-` slug resolution (`/api/checkpoints/ck-jfk-main`)
5. **push-wired** — a non-empty VAPID public key (`/api/vapid-public-key`)
6. **real-time alive** — `/api/events` emits a `{"type":"connected"}` SSE frame
7. **PWA-serving** — web index contains the app shell (`id="root"`), a PWA manifest resolves, `sw.js` is served

## Prerequisites

- Both staging services from `render.yaml` are imported and green:
  `flyby-api-staging` (Starter plan — free tier spins down and kills SSE) and
  `flyby-web-staging` (static).
- Dashboard `sync: false` env vars are filled: staging `DATABASE_URL`, staging
  `REDIS_URL` (a real broker), and web `VITE_API_BASE_URL` pointing at the
  staging API. `ADMIN_API_KEY` auto-generates.
- `MOCK_REDIS` is **not** set in any deployed environment.
- The first deploy ran `prisma migrate deploy` + seed (`preDeployCommand`).

## Run it (staging)

```bash
node scripts/staging-verify.mjs \
  --api https://flyby-api-staging.onrender.com \
  --web https://flyby-web-staging.onrender.com \
  --report tmp/staging-verify-staging.json
```

Exit `0` = contract-alive. Exit `1` = at least one check failed; the report JSON
lists every row (`label`, `status` of `pass`/`fail`/`skip`, `detail`) so a
failure is diagnosable without re-running by hand.

### Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--api` | `$STAGING_API_URL` or `http://127.0.0.1:3197` | API origin under test |
| `--web` | `$STAGING_WEB_URL` or empty | Web origin; empty skips the three web checks (`skip`, still a pass with skips) |
| `--report` | none | Write the JSON report to this path |
| `--expect-env` | `production` | Pin `health.environment`; use `any` to skip the pin |
| `--min-airports` | `51` | Seed-coverage floor |
| `--timeout-ms` | `60000` | Per-request timeout |

## Run it (local dry-run, no prod API)

To exercise the harness without a staging environment — for example while the
prod API is dark and only local capacity exists — boot the monorepo API and dry
run the API half:

```bash
# terminal 1: local API on :3197 (SQLite + mock Redis; see scripts/run-compare.ps1)
# terminal 2:
node scripts/staging-verify.mjs --api http://127.0.0.1:3197 --expect-env development --web ""
```

A local dry-run proves the harness and the candidate's public surface; it is
**not** staging sign-off (the env pin and web checks are skipped/lowered).

## After it passes (M3)

Run the 32-probe contract corpus against the same staging API:

```bash
node scripts/contract-compare.mjs --candidate https://flyby-api-staging.onrender.com --no-prod
```

`--no-prod` validates the candidate against each probe's `expectStatus` +
contract predicate only — it is **not** the M3 byte-match gate. The full gate
(`scripts/run-compare.ps1`, prod + candidate) requires the prod API restored
(TIR-345).

## Rollback rehearsal (M4 precondition — x2)

1. In the Render dashboard, roll `flyby-api-staging` back one deploy.
2. Re-run the staging command above; expect a healthy or a clearly-explained result.
3. Roll forward; re-run once more. Record both outcomes on TIR-339.

## Manual spot-checks (not covered by the one command)

- [ ] Live Redis pub/sub: open `/api/events` in a browser tab, POST a report, watch the `wait-time-update` frame land within seconds
- [ ] PWA installs ("Add to Home Screen") against the staging origin
- [ ] Offline mode: disconnect, submit a report, reconnect -> queued report syncs

## Tests

`scripts/staging-verify.mjs` keeps all network I/O behind an injected fetch, so
the check logic is locked without a live server:
`packages/e2e/staging-verify.test.ts` (run `npm run test --workspace=packages/e2e`).

## Ownership / escalation

Staging provisioning and dashboard actions are the DevOps/board lane. The
harness, the contract corpus, and this checklist are engineering-owned. Escalate
via TIR-339; the CEO go/no-go governs the M4 cutover.
