# scripts/dev-up.ps1 — start the local Flyby Docker Compose stack,
# wait for Postgres to be healthy, apply Prisma migrations, and
# verify the API health endpoint.
#
# Usage (from repo root):
#   pwsh scripts/dev-up.ps1      # PowerShell 7+ (cross-platform)
#   powershell -File scripts/dev-up.ps1   # Windows PowerShell 5.1
#
# Requires: Docker Engine + Docker Compose v2 (the `docker compose` plugin).

$ErrorActionPreference = 'Stop'

# Always operate from the repo root (script may be invoked from anywhere).
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath (Split-Path -Parent $ScriptDir)

$EnvFile = if ($env:ENV_FILE) { $env:ENV_FILE } else { '.env.docker' }

if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "ERROR: $EnvFile not found. Run this from the repo root."
}

Write-Host "==> Bringing up Docker Compose stack (env-file: $EnvFile) ..."
docker compose --env-file $EnvFile up -d
if (-not $?) { throw "docker compose up -d failed." }

Write-Host "==> Waiting for Postgres to be healthy ..."
#
# `depends_on: service_healthy` makes the api service block on this, but we
# poll explicitly so we can give the user a clear readiness signal.
$timeout = 60
$elapsed = 0
$healthy = $false
while ($elapsed -lt $timeout) {
    $status = (docker inspect --format '{{.State.Health.Status}}' flyby-postgres 2>$null)
    if ($status -eq 'healthy') { $healthy = $true; break }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 2
    $elapsed += 2
}
if (-not $healthy) {
    Write-Host ''
    throw "ERROR: Postgres did not become healthy within ${timeout}s. Check: docker compose logs postgres"
}
Write-Host " healthy (after ${elapsed}s)."

Write-Host "==> Applying Prisma migrations against the container database ..."
# Run migrate deploy inside the already-running api container so it uses the
# same DATABASE_URL (postgres://...@postgres:5432/flyby) as the app.
docker compose exec -T api npx prisma migrate deploy
if (-not $?) { throw "prisma migrate deploy failed inside api container." }

Write-Host "==> Verifying API health endpoint ..."
$apiTimeout = 60
$apiElapsed = 0
$apiUp = $false
while ($apiElapsed -lt $apiTimeout) {
    try {
        $resp = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $apiUp = $true; break }
    } catch {
        # API still starting up; keep polling.
    }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 2
    $apiElapsed += 2
}
if (-not $apiUp) {
    Write-Host ''
    throw "ERROR: API health check did not return 200 within ${apiTimeout}s. Check: docker compose logs api"
}
Write-Host " API is up (after ${apiElapsed}s)."

Write-Host ''
Write-Host 'Flyby dev stack is ready:'
Write-Host '  API:   http://localhost:3000   (health: /api/health)'
Write-Host '  DB:    localhost:5432           (flyby/flyby/flyby)'
Write-Host ''
Write-Host 'Stop with:    docker compose down'
Write-Host 'Reset DB:     docker compose down -v; .\scripts\dev-up.ps1'
