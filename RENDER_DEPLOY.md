# Flyby Render Deployment — Operator Playbook

This document captures the **board/manual steps** required to go live on Render using the committed [`render.yaml`](./render.yaml) Blueprint. Steps marked **[devops]** are automated / owned by the DevOps Engineer; steps marked **[board]** require a human with GitHub repo + Render access.

> Status as of this commit: the `render.yaml` Blueprint is committed. The remaining work below is blocked on the board connecting the GitHub repo to Render and creating a Render account (free, no credit card required for the basic tier).

## 1. Prerequisites

| Requirement | Owner | Status |
| --- | --- | --- |
| GitHub repo `github.com/Company/Flyby` exists and `apps/api` is on `main` | board | pending code merge |
| `render.yaml` committed to repo root (this file's sibling) | devops | ✅ committed |
| Render account (free, no card for basic PostgreSQL + web service) | board | pending |
| Render ↔ GitHub provider connection (OAuth once) | board | pending |

## 2. One-time manual setup (board)

1. Sign up at https://render.com (free, no credit card for basic tier).
2. In Render Dashboard → **Account Settings → Git Providers**, connect GitHub and authorize access to the `Company/Flyby` repo.
3. Open the Blueprint deeplink (auto-filled with this repo):

   ```
   https://dashboard.render.com/blueprint/new?repo=https://github.com/Company/Flyby
   ```

4. Render reads `render.yaml` from the repo and shows: `flyby-api` (web service) + `flyby-db` (PostgreSQL).
5. Leave `JWT_SECRET` as **generated** (Render creates it). No manual secrets to fill for the MVP.
6. Click **Apply**. Render provisions the PostgreSQL database first, then builds + deploys the API.

## 3. Migrations (devops)

Once the service is live, run Prisma migrations against the Render PostgreSQL. Options:

- **Render shell** (easiest): Dashboard → `flyby-api` service → Shell → run `npx prisma migrate deploy`.
- **From CI** (later): add a `migrate` job to `.github/workflows/` that uses `DATABASE_URL` from Render env group. Defer until after first deploy.

Prisma reads `DATABASE_URL` automatically (injected by Render via `fromDatabase`).

## 4. Verification (devops)

After deploy completes (typically 2–4 min on free tier):

- Health: `curl -fsS https://flyby-api.onrender.com/api/health` → expect `200 OK`.
- Logs: Render Dashboard → `flyby-api` → Logs → filter for `error`. A clean deploy shows no `ERROR` lines after startup.
- DB: `npx prisma db execute --schema=./apps/api/prisma/schema.prisma --stdin < <(echo "SELECT 1;")` from the Render shell (or any psql client using the connection string).

## 5. Updating the deployment

- Push to `main` → Render auto-builds + deploys `flyby-api` (`autoDeploy: true`).
- To change infra (plan, region, env), edit `render.yaml`, commit, push — Render applies the diff on next deploy.
- To add Redis for cross-instance SSE fan-out later, add a `redis` entry under `databases:` and a `REDIS_URL` env var referencing it. See the comment block at the top of `render.yaml`.

## 6. Cost

| Resource | Plan | Monthly cost |
| --- | --- | --- |
| `flyby-api` web service | free (750 hrs) | $0 |
| `flyby-db` PostgreSQL | free (1 GB) | $0 |

Upgrade to a paid plan only when traffic/concurrency demands it.

## Related tickets

- [TIR-179](/TIR/issues/TIR-179) — Set up Render deployment (this task).
- [TIR-153](/TIR/issues/TIR-153) — AWS credentials task, superseded by Render (free-tier) decision.
- [TIR-119](/TIR/issues/TIR-119) — Parent CI/CD pipeline task, unblocked by Render auto-deploy.
