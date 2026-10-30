# Flyby Launch Checklist

**Status:** AWAITING BOARD GATES (staging import / prod restore - see TIR-339)
**Last reconciled:** 2026-10-21 (convergence era - supersedes the 2026-07-18 version)
**Authoritative operational docs:** `docs/M2-POSTGRES-RUNBOOK.md` (deploy + data migration), `docs/STAGING-VERIFY.md` (staging checklist), `render.yaml` (service definitions)

This checklist is the high-level launch sequence. Where a step needs detail,
the linked doc is the source of truth - do not improvise commands here.

## Pre-Launch (board/DevOps)

### Infrastructure
- [ ] **Restore/upgrade `flyby-api` on Render** (prod API dark since Sep 26 -
      free-tier suspension per TIR-346 triage). Track: TIR-345.
- [ ] **Import the Render Blueprint** from this repo (staging pair:
      `flyby-api-staging` + `flyby-web-staging` per `render.yaml`). Track: TIR-29.
- [ ] Fill `sync: false` env vars on both staging services (staging PG URL,
      staging Redis URL, web -> staging API base). `ADMIN_API_KEY` auto-generates.
- [ ] Prod PG + Redis stay as-is until the cutover decision (M4).

### Database (staging first)
- [ ] First staging deploy auto-runs `prisma migrate deploy --schema prisma/deploy/schema.postgres.prisma` + seed (preDeployCommand)
- [ ] Verify the automated checks pass (next section) - the seed gate query is in the runbook
- [ ] **Data migration** (CEO condition 5 - no prod data loss): `npm run migrate:deploy-data` with `DEPLOY_DATABASE_URL` (prod, read-only usage) + `DATABASE_URL` (staging PG); review the JSON report + per-airport count parity. Full sequence: `docs/M2-POSTGRES-RUNBOOK.md`

## Launch Day

### Staging Verification (one command)
```bash
npm run verify:staging -- \
  --api https://flyby-api-staging.onrender.com \
  --web https://flyby-web-staging.onrender.com \
  --report tmp/staging-verify-staging.json
```
Covers: `/api/health` + services ok, `NODE_ENV=production`, 51-airport seed,
`apt-` id shapes, checkpoint detail, `ck-`-slug resolution, vapid key,
SSE connect frame, web index/PWA/`sw.js`. Exit 0 = contract-alive.
Full checklist (automated + manual halves): `docs/STAGING-VERIFY.md`.
Then the 32-probe corpus: `node scripts/contract-compare.mjs --candidate <staging-api> --no-prod`.

### Manual staging spot-checks
- [ ] Live Redis pub/sub: open `/api/events` in a browser tab, POST a report, watch the `wait-time-update` frame arrive within seconds
- [ ] PWA installs ("Add to Home Screen") against the staging origin
- [ ] Offline mode: disconnect, submit a report, reconnect -> queued report syncs
- [ ] **Rollback rehearsal x2** (M4 precondition): roll the staging API back one deploy in the dashboard, re-run staging-verify, roll forward

### QA gate
- [ ] QA runs the retargeted probe set (retarget table on TIR-339)
- [ ] QA sign-off recorded on TIR-339 - entry gate for M4

### Production cutover (M4 - CEO go/no-go required)
- [ ] M3 byte-compare vs prod green: `scripts/run-compare.ps1` (requires prod restored, TIR-345)
- [ ] CEO go/no-go recorded on TIR-339
- [ ] Flip: web `VITE_API_BASE_URL` -> monorepo API URL (blueprint env or dashboard)
- [ ] Old flyby-api service stays warm through the window (rollback = flip the env var back)
- [ ] Live smoke + 30-min watch window

### Production Verification
- [ ] `https://flyby-api.onrender.com/api/health` -> `{"status":"ok","services":{"database":"ok","redis":"ok"}}`
- [ ] The 32-probe corpus against the NEW prod: `node scripts/contract-compare.mjs --candidate https://flyby-api.onrender.com --no-prod`
- [ ] Real-time updates work (SSE), push notifications functional
- [ ] Data parity: per-airport counts match the pre-cutover migration report

## Post-Launch
- [ ] Day 1: error logs, API p95 latency, SSE connection success rate, DB performance
- [ ] Week 1: DAU, feature usage, bug triage, iteration priorities
- [ ] Ongoing: dependency updates, security audits, infra scaling
- [ ] Decommission the old deploy repo's services once stable (final step of Option A)

## Success Metrics (first month)
- Availability >99.9% uptime (Starter plan on the API - free tier spins down and kills SSE)
- API p95 < 200ms
- Wait-time accuracy: within 5 min on 80% of reports
- Adoption: 100+ DAU

## Rollback Plan (convergence era)

1. **Public surface**: revert the web's `VITE_API_BASE_URL` to the old API URL -
   the old service stays warm through the cutover window, so this is a config
   flip, not a deploy.
2. **Staging**: Render deploy history -> roll back one deploy (rehearsed twice pre-cutover).
3. **Database**: the migration is additive into staging PG; prod PG is never
   mutated before the flip. A post-flip data issue means flipping back, not
   rolling back migrations.
4. Escalation: post on TIR-339; CEO go/no-go governs retries.

## Support Contacts
- **Engineering:** Founding Engineer (TIR-339 owner)
- **Infrastructure:** DevOps lane / board (Render dashboard access - TIR-29)
- **Status Page:** to be configured
