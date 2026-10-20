# M2 Runbook — PostgreSQL deploy path for the monorepo (TIR-339)

Status: **ready for DevOps wiring**. Everything in this document has been
verified against the code in this repo; the only external inputs are the
Render dashboard (board access) and the deploy repo's prod schema dump
(CTO lane, see TIR-336).

## Why a second schema file

The monorepo developed on SQLite for local dev (no docker dependency in the
agent workspace). Prod — and therefore the Option-A deploy target — is
PostgreSQL. Prisma does not support env-switchable providers, so the repo
carries exactly two schemas:

| File | Provider | Used by |
|---|---|---|
| `packages/api/prisma/schema.prisma` | sqlite | local dev, test suite (721 tests) |
| `packages/api/prisma/deploy/schema.postgres.prisma` | postgresql | Render staging/prod, docker-compose PG |

The models are enforced identical by `tests/schema-parity.test.ts` (runs in
the normal suite — model drift fails CI before it can reach a deploy).

## Migration artifacts

- `packages/api/prisma/deploy/migrations/migration_lock.toml` — `postgresql`
- `packages/api/prisma/deploy/migrations/20261019000000_init/migration.sql` —
  full baseline DDL: 8 tables, all unique/composite indexes, FKs with the
  app's delete semantics (`CASCADE` for airport→checkpoint→wait_times and
  flags/subscriptions/logs, `SET NULL` for optional user refs).

The SQLite migrations under `packages/api/prisma/migrations/` are **never**
applied to Postgres. Do not mix them.

## Commands (run from `packages/api`)

```bash
# 1. Generate the Prisma Client for Postgres (REQUIRED before build/start)
prisma generate --schema prisma/deploy/schema.postgres.prisma

# 2. Apply the baseline (and any future PG migrations)
DATABASE_URL="<pg url>" prisma migrate deploy --schema prisma/deploy/schema.postgres.prisma

# 3. Seed airports/checkpoints (same seed, PG client)
DATABASE_URL="<pg url>" npx tsx prisma/seed.ts
```

> **Footgun:** after step 1 the generated client targets Postgres. If you
> then run the local SQLite test suite, regenerate with the default schema
> first (`prisma generate` with no args). This bites exactly once and is
> loud (driver errors), but avoid the round trip.

### Suggested Render build/start (staging service `flyby-api-staging`)

- Build: `cd packages/api && npm install && prisma generate --schema prisma/deploy/schema.postgres.prisma && npx tsc`
- Start: `node dist/server.js`
- Pre-deploy hook (or first-boot job): `prisma migrate deploy --schema prisma/deploy/schema.postgres.prisma && npx tsx prisma/seed.ts`

## Environment variables (staging service)

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` staging PG | fresh staging database, NOT prod (write-safety first) |
| `REDIS_URL` | staging Redis URL | SSE pub/sub (condition 2 of CEO approval) |
| `ADMIN_API_KEY` | random hex, `sync: false` | same pattern as c142ba7 on the deploy service |
| `NODE_ENV` | `production` | |
| `PORT` | Render default | server reads `process.env.PORT` |

## Git remote + Blueprint import (DONE 2026-10-20, DevOps next)

The monorepo push path is live: branch **`monorepo-candidate`** on
`github.com/samuel2064/Flyby` (commit `88d1a838`) carries the full convergence
candidate as a single clean snapshot commit - no `node_modules/`, `dist/`,
`*.db`, `.env*`, or agent working files; verified green on that exact tree
(API 767/767, web 377/377, e2e config 8/8).

DevOps steps from here:

1. Render -> New -> Blueprint -> repo `samuel2064/Flyby`, branch
   `monorepo-candidate`. `render.yaml` at the repo root defines
   `flyby-api-staging` + `flyby-web-staging` (no per-service `branch:` pin -
   services follow the import branch).
2. Fill the `sync: false` env vars from the table above (`DATABASE_URL` must
   be a fresh staging database, never prod; `REDIS_URL` a real broker).
3. First deploy runs preDeployCommand: `migrate deploy` + seed against the
   staging database, then boots `dist/server.js` with `/api/health` as the
   health check.
4. Then the data-parity migration below, and the M3 corpus (32 probes) can
   run against the staging URL.

Branch-push safety (verified against the repo's workflows before pushing):
`ci.yml` (main/PRs only), `keep-alive.yml` (cron), `live-smoke.yml`
(main + cron) - nothing fires on `monorepo-candidate` pushes, and Render
auto-deploy tracks only `main`, so prod is untouched.

## Data parity (CEO condition 5 — non-negotiable)

Prod `WaitReport` rows live on the deploy Postgres. The cutover must move
them with zero loss. The mapping core already exists and is unit-tested:

- **`packages/api/src/migration/deployMapping.ts`** — pure mapping functions
  (source/reportType/flagReason enum translation with warn-and-default,
  checkpoint code derivation, compat-user session mailboxes, airport row
  validation). Tests: `tests/deployMapping.test.ts` (22).
- **`packages/api/src/migration/migrateDeployData.ts`** — orchestration with
  injected reader/sink ports: stage sequencing, per-airport checkpoint code
  derivation, compat-user session mapping, per-report flag counts, batched
  writes, aggregated warnings, stage counts. Tests:
  `tests/migrateDeployData.test.ts` (6) incl. idempotent re-run.
- **`packages/api/src/migration/pgDeploySource.ts`** — the deploy-Postgres
  reader (keyset-paginated WaitReport reads, `DEPLOY_DATABASE_URL`).
- **`packages/api/src/migration/prismaMigrationSink.ts`** — the
  monorepo-Postgres writer (createMany+skipDuplicates everywhere: preserved
  deploy ids make re-runs converge).
- **Runner**: `npm run migrate:deploy-data` with both `DEPLOY_DATABASE_URL`
  (deploy PG, read-only usage) and `DATABASE_URL` (target PG) set. It refuses
  non-postgres URLs, prints a JSON stage-count/warnings report, and exits 0
  on completed runs (skips are counted, not fatal) / 1 on config or IO errors.

One-time pre-flight before the real run: confirm the deploy database's table
names match the reader's SQL (PascalCase `"Airport"`/`"Checkpoint"`/
`"WaitReport"`/`"ReportFlag"`, camelCase columns) against the
`pg_dump --schema-only` from step 1 below. Any drift fails loudly in the
reader, by design.

Deploy schema columns the mapper targets (verified against
`samuel2064/Flyby`):

| Deploy model | Columns |
|---|---|
| `Airport` | `id, iataCode, name, city, country, latitude, longitude, timezone, createdAt` |
| `Checkpoint` | `id, airportId, terminal, name, latitude, longitude, active, createdAt` |
| `WaitReport` | `id, checkpointId, minutes, source, reportType, sessionId, reportedAt, createdAt` |
| `ReportFlag` | `id, reportId, reason, note, sessionId, createdAt` |

Migration rules baked into the mapper (none fabricate data):

- Deploy row ids are preserved as monorepo ids → `createMany` with
  `skipDuplicates` makes re-runs idempotent.
- Unknown enum values map to the closest safe default **and** emit a warning
  string; the migration report counts them. Nothing is silently dropped.
- Reports whose checkpoint cannot be resolved return `checkpointId: null`
  and are skipped-and-counted, never assigned to a guessed checkpoint.
- Deploy `sessionId`s become deterministic compat Users via the M1b mailbox
  convention (`compat-<sha1-12>@flyby.local`), so attribution and per-identity
  rate limiting survive without inventing real users.
- Airports missing required `country`/`timezone` are skipped-and-counted.

Load sequence:

1. **Get the deploy repo's prod schema dump** (CTO, TIR-336) to confirm the
   column list above against the live database before the run.
2. Seed staging (airports/checkpoints incl. `Main Checkpoint` rows) →
   then load deploy airports/checkpoints, then wait reports, then flags —
   with a counts-per-stage report at each step.
3. Verify per-airport counts against prod (`SELECT airport, count(*)` on
   both). That parity check is the gate.
4. **Dual-write window** (alternative if cutover risk is judged too high):
   keep the old service as writer of record, replay the delta into staging PG
   immediately before the flip. Both paths end with the same count parity gate.

## Seed gate for staging

`prisma/seed.ts` seeds the 51-airport catalog; prod's historic rows reference
a `Main` checkpoint per airport, which the seed must include (the compat layer
already maps missing checkpoint names to `Main`, but the row FK needs the
checkpoint row to exist). Verify with a count query after seed:

```sql
SELECT a.code, count(c.id) FROM airports a LEFT JOIN checkpoints c ON c.airport_id = a.id GROUP BY a.code;
```

## Rollback story (M4 dependency)

The PG baseline is additive-only on a fresh staging database; prod PG is
untouched until the cutover's data step, which is a COPY into staging (not a
mutation of prod). Rollback at every stage = point the web's API base URL back
at the old service; the old service stays warm through the window per the
TIR-339 plan.
