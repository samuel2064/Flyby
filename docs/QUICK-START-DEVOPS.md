# Flyby — Quick Start for DevOps

**Status:** READY — staging Blueprint import is the single outstanding action (TIR-339 M2)
**Last Updated:** 2026-11-07
**Branch:** `monorepo-candidate` (repo `samuel2064/Flyby`) — this branch IS the Option-A deploy candidate. Do not import `main`.

## Current state (verified 2026-11-07)

- Tests: API **905/905**, web **436/436**, e2e **21/21** passing
- M3 byte-compare vs live prod: **pass=14, known=18, fail=0** (`.\scripts\run-compare.ps1 -Full`, report in `test-output/`)
- Prod (`flyby-api.onrender.com`) healthy and serving as the M3 baseline
- Staging services: **not yet provisioned** (the action below)

## The action: import the Render Blueprint (staging)

`render.yaml` at the repo root defines both services. Import it from branch
`monorepo-candidate`:

1. Render Dashboard → New → Blueprint → repo `samuel2064/Flyby`, branch `monorepo-candidate`
2. Fill the `sync: false` env vars when prompted:
   - `flyby-api-staging`: `DATABASE_URL` (staging Postgres), `REDIS_URL` (real broker — **not** `MOCK_REDIS`, that must stay unset in deployed envs), `ADMIN_API_KEY` (auto-generates)
   - `flyby-web-staging`: `VITE_API_BASE_URL` pointing at the staging API URL
3. Copy prod's **VAPID keys** into the staging API env (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) — or push subscriptions break at cutover. A malformed paste degrades to ephemeral keys with a console warning (validated since `1bbda01`), but copy them correctly.
4. The first deploy runs `prisma migrate deploy` + seed via the pre-deploy command (PG schema: `packages/api/prisma/deploy/schema.postgres.prisma`).

## Verify (one command, after both services are green)

```bash
node scripts/staging-verify.mjs \
  --api https://flyby-api-staging.onrender.com \
  --web https://flyby-web-staging.onrender.com \
  --report tmp/staging-verify-staging.json
```

Checks: health (db+redis ok, `environment: production`), seeded airports,
`apt-`/`ck-` id resolution, VAPID key present, SSE connect frame, PWA shell +
manifest + `sw.js` served.

Then the Founding Engineer runs the M3 staging-vs-prod compare and the M4
live smoke (`node scripts/live-smoke.mjs`) against the staging URL same-day.

## Deeper docs (in order of use)

| Doc | What it covers |
|---|---|
| `docs/M2-POSTGRES-RUNBOOK.md` | PG schema layout, migration + seed commands, service build/start |
| `docs/STAGING-VERIFY.md` | Authoritative staging pre-flight checklist |
| `docs/LAUNCH-CHECKLIST.md` | Full launch sequence + rollback plan |
| `docs/CONVERGENCE-DECISION.md` | Why `monorepo-candidate` is the deploy target (Option A) |
| `render.yaml` | Service definitions |

## Local dev sanity (optional)

```bash
npm ci && npm run test   # 905 + 436 + 21 tests
npm run dev              # API :3001, web :5173
```

Health probe shape: `GET /api/health` → `{ "status": "ok", "environment": ..., "services": { "database": "ok", "redis": "ok" }, ... }` (NOT the old `{"ok":true}`).
