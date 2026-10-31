# Flyby Convergence Decision Brief (TIR-339)

**Author:** Founding Engineer
**Date:** 2026-10-31 (decision record added)
**Status:** **Decision in — Option A approved by the CEO** (2026-09-25, reaffirmed
2026-10-19). Remaining gates are board/DevOps actions, not the direction choice.
See §1a. Gates M3 prod byte-compare and M4 cutover.
**Companion docs:** `docs/M2-POSTGRES-RUNBOOK.md`, `docs/LAUNCH-CHECKLIST.md`, `docs/STAGING-VERIFY.md`, `scripts/approved-divergences.json`

> Option labels below follow the A/B/C framing already on TIR-339. If the
> board's labels differ, map by direction — Option A = converge on the monorepo,
> Option B = converge on the deploy repo, Option C = federate (keep both).

## 1. The decision

Two codebases implement Flyby's API:

| | Repo | Role today |
|---|---|---|
| **Monorepo** | `github.com/samuel2064/Flyby`, branch `monorepo-candidate` (this repo) | Option-A deploy candidate; full auth/users/notifications; 889-test backend |
| **Deploy repo** | the service behind Render `flyby-api` | Written-of-record before prod went dark (Sep 26, TIR-345/346) |

They have diverged. Exactly one must become the writer-of-record for production
data, or we define a durable split. The CEO must choose the direction.

## 1a. Decision record — the CEO has already chosen Option A

The direction is **not** still open. The CEO approved Option A twice on TIR-339:

- **2026-09-25** — *"Decision made: Option A - the monorepo becomes the single
  deploy target."* Options B and C explicitly rejected. Hard constraints set:
  (1) no public-surface regression on launch day incl. QA mock-era alias routes,
  (2) staging URL green before anything touches `flyby-api`/`flyby-web`,
  (3) `DATABASE_URL`/Redis env wiring confirmed before cutover, (4) a tested
  rollback path.
- **2026-10-19** — *"Decision: Option A … Approved,"* with six conditions of
  approval: migration sequence + rollback plan first; staging green before prod;
  launch-guarded contract tests green in **both** suites; QA alias routes honored
  or probes retargeted (QA sign-off); **data parity** ("No prod data loss.
  Non-negotiable."); and a final CEO go/no-go before the production flip.

**Correction to the TIR-466 check-in:** its line *"CEO decision needed on
convergence option"* is stale — the decision is on record since 2026-09-25.
So too is *"Deploy repo has: live features (stats, moderation, opaque IDs) not in
monorepo"* (stale since M1, §2). The live gates are the **conditions**, not the
option: TIR-345 (prod restore, needed for the M3 byte-compare), the Render
staging Blueprint import, and the staging PG/Redis envs — all board/DevOps
actions.

## 2. Key finding — the divergence is smaller than the check-in records

The TIR-466 check-in states: *"Deploy repo has: live features (stats,
moderation, opaque IDs) not in monorepo."* **That is stale as of the M1 compat
landing (commit `128a2dd7`).** The monorepo now serves the deploy contract
verbatim. Evidence is in `packages/api/src/deployCompat.ts` and the route
inventory in `packages/api/src/app.ts`:

| Deploy-era capability | Monorepo route(s) | Where |
|---|---|---|
| Opaque `apt-<code>` / `ck-<code>-<slug>` ids | `resolveDeployCheckpointId`, `resolveCompatCheckpointId` | `deployCompat.ts` |
| Stats: summary / per-airport / per-checkpoint / history | `/api/wait-times/summary`, `/api/airports/:code/wait-stats`, `/api/checkpoints/:id/stats`, `/api/checkpoints/:id/history` (compat `window`/`bucket`) | `waitStatsRoutes.ts`, `deployCompat.ts` |
| Moderation queue + hide/clear | `/api/moderation/reports`, `/api/moderation/reports/:id/hide`, `/:id/clear` (`ADMIN_API_KEY`, fail-closed 503) | `deployCompat.ts` |
| Wait-times read/write | `GET|POST /api/wait-times`, `POST /api/wait-times/report` | `deployCompat.ts` |
| SSE deploy frames | `/api/events`, `/api/wait-times/stream`, `/api/sse` | `deployCompat.ts` |
| Push / subscriptions / preferences | `/api/push/*`, `/api/subscriptions`, `/api/preferences`, `/api/notifications/*` | `deployCompat.ts` |

**What the monorepo has that the deploy repo does not** (the reason Option A is
worth it): real auth (`/v1/auth`), users, `/api/me`, persisted notification
subscriptions + preferences with a User FK, the 889-test backend suite, the
sqlite↔postgres `schema-parity` guard, and the deploy data-migration toolkit
(`src/migration/*`).

## 3. Options

### Option A — Converge on the monorepo (recommended)
Monorepo becomes the single source of truth and production runtime; deploy repo
retired after cutover.

- **Status: engineered.** Deploy contract covered by `deployCompat.ts`; Postgres
  schema + migrations ready (`packages/api/prisma/deploy/`); idempotent,
  no-fabrication data migration (`src/migration/*`); staging blueprint
  (`render.yaml`); M3 entry-gate harness (`scripts/staging-verify.mjs`).
- **Pros:** one codebase; keeps real auth/users/persistence and 889 tests; no
  dual maintenance; the divergence contract is already codified.
- **Cons:** cutover means a new service serves prod; requires the M2 deploy +
  data-parity gate.

### Option B — Converge on the deploy repo
Deploy repo stays the runtime; port monorepo-only capabilities (auth/users,
persisted notifications, migration toolkit, tests) into it; freeze the monorepo.

- **Pros:** no runtime flip.
- **Cons:** the deploy repo is a separate repo/toolchain — porting auth, Prisma
  migrations, and ~889 tests is large net-new work; the M1/M2/M3 artifacts
  (`deployCompat`, migration toolkit, staging harness) become dead code. We would
  re-solve a problem already solved.

### Option C — Federate (keep both)
Deploy repo stays runtime; monorepo becomes the feature lane; contract held by
`approved-divergences.json` + `contract-compare.mjs`.

- **Pros:** no cutover now.
- **Cons:** two writers risk silent data divergence; every feature ships twice or
  the contract drifts; and "keep serving" is not actually happening — the prod
  API has been dark since Sep 26.

## 4. Recommendation (approved)

**Option A.** It is the direction the codebase is already built and tested for;
Options B/C both require re-doing work that is already green. The CEO approved
this direction on 2026-09-25 and reaffirmed it 2026-10-19 (§1a); the remaining
inputs are board/DevOps actions already enumerated (TIR-29 Render blueprint
import; staging PG/Redis envs), not engineering work.

## 5. What remains — the approval conditions, not the direction

The direction is settled (§1a). The open items are the CEO's conditions of
approval, not an A/B/C choice:

- **Staging green before prod** — M3 *byte-compare* vs prod requires the prod API
  restored (TIR-345). The **contract** gate (`npm run verify:staging` and
  `node scripts/contract-compare.mjs --no-prod`) runs the moment staging exists;
  only the final byte-match gate is gated on TIR-345 → TIR-365.
- **Migration sequence + rollback plan, data parity** — `docs/M2-POSTGRES-RUNBOOK.md`.
- **QA alias routes honored or probes retargeted** — `scripts/approved-divergences.json`.
- **Final CEO go/no-go** before the production flip.
- **Timeline:** engineering side is ready today; schedule = Render blueprint
  import + staging PG/Redis envs.

## 6. Engineering readiness (verified 2026-10-31)

- API **889/889**, Web **382/382**, e2e config **21/21** (local, SQLite +
  mocked Redis). Playwright e2e **20/20** previously verified. Total **1312/1312**.
- `npm run verify:staging` passes against the seeded in-process API
  (7 passed, 0 failed, 3 web skips) — locked as a CI regression by
  `packages/api/tests/staging-verify.integration.test.ts`.

## 7. Open items / risks

- **Contract, not bytes:** the two approved detail-route wrapper divergences
  (`/api/airports`, `/api/airports/:code`) mean M3 must compare contract, not
  byte shape — see `scripts/approved-divergences.json`.
- **Subscription uniqueness:** DB-level `@@unique([endpoint, airportId])` +
  dedupe migration (`20261030_notification_subscription_unique`) is in the tree;
  apply on staging during M2.
- **Prod baseline:** byte-compare cannot run until the prod API is restored
  (TIR-345), which is also the last dependency of TIR-365.
