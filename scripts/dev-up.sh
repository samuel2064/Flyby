#!/usr/bin/env bash
# scripts/dev-up.sh — start the local Flyby Docker Compose stack,
# wait for Postgres to be healthy, apply Prisma migrations, and
# verify the API health endpoint.
#
# Usage (from repo root):
#   bash scripts/dev-up.sh
#
# Requires: Docker Engine + Docker Compose v2 (the `docker compose` plugin).
# Tested on macOS, Linux, and WSL2 on Windows.

set -euo pipefail

# Always operate from the repo root (script may be invoked from anywhere).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

ENV_FILE="${ENV_FILE:-.env.docker}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run this from the repo root." >&2
  exit 1
fi

echo "==> Bringing up Docker Compose stack (env-file: $ENV_FILE) ..."
docker compose --env-file "$ENV_FILE" up -d

echo "==> Waiting for Postgres to be healthy ..."
# `depends_on: service_healthy` makes the api service block on this, but we
# poll explicitly so we can give the user a clear readiness signal.
timeout=60
elapsed=0
until docker inspect --format '{{.State.Health.Status}}' flyby-postgres 2>/dev/null | grep -q healthy; do
  if [ "$elapsed" -ge "$timeout" ]; then
    echo "ERROR: Postgres did not become healthy within ${timeout}s." >&2
    echo "Check logs:  docker compose logs postgres" >&2
    exit 1
  fi
  printf '.'
  sleep 2
  elapsed=$((elapsed + 2))
done
echo " healthy (after ${elapsed}s)."

echo "==> Applying Prisma migrations against the container database ..."
# Run migrate deploy inside the already-running api container so it uses the
# same DATABASE_URL (postgres://...@postgres:5432/flyby) as the app.
docker compose exec -T api npx prisma migrate deploy

echo "==> Verifying API health endpoint ..."
api_timeout=60
api_elapsed=0
until curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; do
  if [ "$api_elapsed" -ge "$api_timeout" ]; then
    echo "ERROR: API health check did not return 200 within ${api_timeout}s." >&2
    echo "Check logs:  docker compose logs api" >&2
    exit 1
  fi
  printf '.'
  sleep 2
  api_elapsed=$((api_elapsed + 2))
done
echo " API is up (after ${api_elapsed}s)."

echo ""
echo "Flyby dev stack is ready:"
echo "  API:   http://localhost:3000   (health: /api/health)"
echo "  DB:    localhost:5432           (flyby/flyby/flyby)"
echo ""
echo "Stop with:    docker compose down"
echo "Reset DB:     docker compose down -v && bash scripts/dev-up.sh"
