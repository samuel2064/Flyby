# Flyby Local Development — Docker Setup

This guide gets every engineer running an identical local stack: PostgreSQL 16 + the Flyby API, matching the Render production Blueprint ([render.yaml](./render.yaml)). This eliminates the SQLite/PostgreSQL dev-prod mismatch.

> **TL;DR:** `docker compose --env-file .env.docker up -d` then `docker compose exec api npx prisma migrate deploy`. Or run the helper script below.

## 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker Engine 20.10+ + Docker Compose v2 | Verify with `docker compose version` (should print v2.x) |
| `apps/api/` present in repo root | Local build context for the API image. See [render.yaml](./render.yaml) `rootDir: apps/api`. |
| `.env.docker` | Committed to repo; safe dev defaults. To override locally, copy to `.env.docker.local` and edit. |

No local Node.js or PostgreSQL install is required — everything runs in containers.

## 2. Files

| File | Purpose |
|------|---------|
| [`docker-compose.yml`](./docker-compose.yml) | Two services: `postgres` (PostgreSQL 16) + `api` (Node.js from `apps/api`). Healthchecks, persistent volume, and source code mounting for live development. |
| [`.env.docker`](./.env.docker) | Dev env vars: `DATABASE_URL`, `NODE_ENV`, `JWT_SECRET` (dev placeholder). |
| [`scripts/dev-up.sh`](./scripts/dev-up.sh) | Unix/macOS/WSL helper: up → wait healthy → migrate → verify. |
| [`scripts/dev-up.ps1`](./scripts/dev-up.ps1) | Windows PowerShell helper: same flow. |

## 3. Starting the stack

### One-liner (recommended)

```sh
# Unix / macOS / WSL
bash scripts/dev-up.sh

# Windows PowerShell
pwsh scripts/dev-up.ps1
# or, on Windows PowerShell 5.1:
powershell -File scripts/dev-up.ps1
```

The script:
1. runs `docker compose --env-file .env.docker up -d`,
2. waits for Postgres healthcheck to go healthy (≤60s),
3. runs `npx prisma migrate deploy` inside the `api` container,
4. polls `http://localhost:3000/api/health` until it returns 200.

### Manual

```sh
docker compose --env-file .env.docker up -d
# wait for postgres to be healthy:
docker compose ps            # STATUS column should read "(healthy)"
docker compose exec api npx prisma migrate deploy
curl http://localhost:3000/api/health   # expect 200
```

## 4. Development Workflow

With the source code mounted as a volume:
- **Code changes**: Take effect immediately (no rebuild needed)
- **Dependency changes**: If you modify `package.json`, run `docker compose build api` to rebuild the image
- **Prisma schema changes**: Run `docker compose exec api npx prisma migrate dev --name <name>` to create a migration, then `docker compose exec api npx prisma migrate deploy` to apply it

## 5. Service endpoints (localhost)

| Service | URL / DSN | Credentials |
|---------|-----------|-------------|
| API | `http://localhost:3000` (health: `/api/health`) | — |
| PostgreSQL | `postgresql://flyby:flyby@localhost:5432/flyby` | user `flyby`, pw `flyby`, db `flyby` |

> **Inside the compose network** the `api` service reaches Postgres at hostname `postgres` (`postgresql://flyby:flyby@postgres:5432/flyby`). From **host-side** tooling (e.g. running Prisma from your laptop), use `localhost:5432`.

## 6. Common commands

```sh
# View logs (all services, follow)
docker compose logs -f
docker compose logs -f api          # just the API
docker compose logs -f postgres     # just the DB

# Restart the API (picks up code changes immediately due to volume mount)
docker compose restart api

# Rebuild the API image (after dependency changes / Dockerfile edits)
docker compose --env-file .env.docker up -d --build api

# Stop the stack (keeps database data in the volume)
docker compose down

# Stop AND wipe the database volume (fresh start — migrations re-run)
docker compose down -v
bash scripts/dev-up.sh          # (or .ps1) brings it back, applies migrations
```

## 7. Prisma workflows (run inside the running `api` container)

```sh
docker compose exec api npx prisma migrate dev --name <migration_name>  # create migration
docker compose exec api npx prisma migrate deploy                       # apply migrations
docker compose exec api npx prisma studio                                # DB GUI (opens :5555)
docker compose exec api npx prisma generate                             # regenerate client
```

## 8. How it mirrors production

| Concern | Local (docker-compose) | Production (render.yaml) |
|---------|------------------------|--------------------------|
| Database engine | PostgreSQL 16 (`postgres:16-alpine`) | PostgreSQL 16 (Render free) |
| App build context | `./apps/api` | `rootDir: apps/api` |
| Start command | image `CMD` / `npm start` | `npm start` |
| Health path | `/api/health` | `/api/health` |
| `DATABASE_URL` | `postgresql://flyby:flyby@postgres:5432/flyby` | injected by Render (`fromDatabase`) |
| `NODE_ENV` | `development` | `production` |
| Redis | intentionally omitted (SSE uses in-process Map) | intentionally omitted for MVP |

The only intentional differences are `NODE_ENV` (dev vs prod) and the connection-string source (local env vs Render-injected).

## 9. Resetting the database

```sh
docker compose down -v          # drops the flyby_pgdata volume
bash scripts/dev-up.sh         # recreates everything + applies migrations
```

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---------|-------------------|
| `port 5432 already in use` | A host Postgres is bound to 5432. Stop it, or change the left side of `5432:5432` in `docker-compose.yml`. |
| `port 3000 already in use` | Another app holds 3000. Change `3000:3000` left side. |
| Postgres never `(healthy)` | `docker compose logs postgres`. First run needs ~10s; the healthcheck retries 10×. |
| API health never 200 | `docker compose logs api`. Most common: missing `apps/api/Dockerfile` or migrations failed (check the migrate step output). |
| `prisma migrate deploy` fails | Confirm Postgres is `(healthy)` and `DATABASE_URL` resolves inside the container: `docker compose exec api printenv DATABASE_URL`. |
| Changes to app code not reflected | The image is built once; rebuild with `docker compose up -d --build api` (not needed for simple code changes due to volume mount). |

## 11. Related tickets

- [TIR-187](/TIR/issues/TIR-187) — this local Docker Compose environment.
- [TIR-179](/TIR/issues/TIR-179) — Render Blueprint (production counterpart).
- [TIR-178](/TIR/issues/TIR-178) — Prisma schema (migrations source of truth).