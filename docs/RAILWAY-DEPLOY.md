# Railway deployment runbook — flyby-api (TIR-452)

Source of truth for migrating the production API off Render (suspended free
tier, TIR-345) onto Railway per the CTO `alternative-hosting` playbook (TIR-437).

## Deploy target

| Item | Value |
|------|-------|
| GitHub repo | `samuel2064/Flyby` |
| Branch | `monorepo-candidate` (converged monorepo; `packages/api` has full auth/users/notifications) |
| Service root (Railway "Root Directory") | `/` (repo root) |
| Config file | `railway.json` (repo root — committed alongside this doc) |
| Health check | `GET /api/health` → HTTP 200 |
| Build | Nixpacks: `npm install --include=dev` + `prisma generate` (deploy schema) + `tsc` |
| Pre-deploy | `prisma migrate deploy` against `packages/api/prisma/deploy/schema.postgres.prisma` |
| Start | `node packages/api/dist/server.js` |

The deploy Prisma schema is `packages/api/prisma/deploy/schema.postgres.prisma`
(PostgreSQL wire format); its migrations live in `packages/api/prisma/deploy/migrations`.
The default `packages/api/prisma/schema.prisma` is the SQLite/dev schema and must
never be used against Postgres.

## Steps

1. **Connect Railway** — complete the Paperclip Railway connection card
   (OAuth, requires the responsible user). This is the only human-gated step.
2. **New Project → Deploy from GitHub repo** → `samuel2064/Flyby`, branch
   `monorepo-candidate`. Railway reads `railway.json`.
3. **Add PostgreSQL** (project → New → Database → PostgreSQL). Railway injects
   `DATABASE_URL`.
4. **Add Redis** (project → New → Database → Redis). Railway injects `REDIS_URL`.
   Redis is required for SSE pub/sub; do **not** set `MOCK_REDIS` in production.
5. **Set service variables** on the API service:
   - `DATABASE_URL = ${{Postgres.DATABASE_URL}}` (Railway reference variable)
   - `REDIS_URL = ${{Redis.REDIS_URL}}` (Railway reference variable)
   - `NODE_ENV = production`
   - `ADMIN_API_KEY` (generate: `openssl rand -hex 32`; required for
     `DELETE /api/reports/:id`, else returns 503)
   - `JWT_SECRET` (generate a secure random value)
   - `PORT` — leave unset; Railway injects it and `server.ts` honours `process.env.PORT`
6. **Deploy.** Verify:
   - `GET https://<railway-app>.up.railway.app/api/health` → 200
   - `GET https://<railway-app>.up.railway.app/api/wait-times?airport=SEA` → 200
7. **Seed (optional, first deploy only):** the airport/checkpoint catalog is
   needed for real data. Run `npx tsx packages/api/prisma/seed.ts` in the Railway
   shell once, only if `/api/wait-times` returns empty for known airports.
8. **DNS / clients:** point the PWA `VITE_API_BASE_URL` and any hardcoded
   endpoints at the Railway URL (or attach a custom domain in Railway). Then
   close TIR-452 → unblocks TIR-365 → TIR-364 → TIR-345.

## Rollback

Railway keeps prior deployments; "Redeploy" a previous build, or revert the
`railway.json` commit. Render service/DB stay untouched as a fallback.

## Validation note

`railway.json` was authored against the Render blueprint
(`render.yaml`, `packages/api` service) and the existing
`packages/api/Dockerfile`. Build/start commands mirror that config. First
deploy should be watched for Nixpacks workspace-resolution or Prisma-generate
issues; if Nixpacks misbehaves, switch `build.builder` to `DOCKERFILE` with
`dockerfilePath: packages/api/Dockerfile` (that image builds `packages/api` in
isolation and needs `prisma migrate deploy` supplied via `preDeployCommand` with
the Prisma CLI added to runtime deps).
