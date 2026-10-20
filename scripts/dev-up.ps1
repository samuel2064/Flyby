# Flyby Docker Compose Development Startup Script (PowerShell)
# This script starts the Docker Compose stack and runs migrations

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Flyby Docker Compose Development Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $RootDir

# Check if docker is available
try {
    $null = docker --version
} catch {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Starting Docker Compose services..." -ForegroundColor Yellow
docker compose --env-file .env.docker up -d

Write-Host ""
Write-Host "⏳ Waiting for services to be healthy..." -ForegroundColor Yellow
Write-Host ""

# Function to wait for a service to be healthy
function Wait-ForHealth {
    param(
        [string]$ServiceName,
        [string]$DisplayName,
        [int]$MaxAttempts = 30
    )
    
    Write-Host "Waiting for $DisplayName..." -ForegroundColor Cyan
    
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        $status = docker compose ps $ServiceName 2>$null | Select-String -Pattern "healthy" -Quiet
        
        if ($status) {
            Write-Host "✅ $DisplayName is healthy" -ForegroundColor Green
            return $true
        }
        
        if ($i -eq $MaxAttempts) {
            Write-Host "❌ $DisplayName failed to become healthy" -ForegroundColor Red
            docker compose logs $ServiceName
            return $false
        }
        
        Write-Host "  Waiting... ($i/$MaxAttempts)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

# Wait for each service
$postgresHealthy = Wait-ForHealth -ServiceName "postgres" -DisplayName "PostgreSQL"
if (-not $postgresHealthy) { exit 1 }

$redisHealthy = Wait-ForHealth -ServiceName "redis" -DisplayName "Redis"
if (-not $redisHealthy) { exit 1 }

$apiHealthy = Wait-ForHealth -ServiceName "api" -DisplayName "API"
if (-not $apiHealthy) { exit 1 }

Write-Host ""
Write-Host "🗄️  Running Prisma migrations..." -ForegroundColor Yellow
docker compose exec -T api npx prisma migrate deploy

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "✅ Flyby stack is up and running!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Services:" -ForegroundColor Cyan
Write-Host "   - API:      http://localhost:3001"
Write-Host "   - Health:   http://localhost:3001/api/health"
Write-Host "   - PostgreSQL: localhost:5432"
Write-Host "   - Redis:    localhost:6379"
Write-Host ""
Write-Host "🛑 To stop: docker compose down"
Write-Host "🔄 To restart: docker compose restart"
Write-Host "📋 To view logs: docker compose logs -f"
Write-Host ""