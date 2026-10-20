#!/bin/bash
set -euo pipefail

# Flyby Docker Compose Development Startup Script
# This script starts the Docker Compose stack and runs migrations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "Flyby Docker Compose Development Setup"
echo "========================================="
echo ""

cd "$ROOT_DIR"

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first."
    exit 1
fi

echo "📦 Starting Docker Compose services..."
docker compose --env-file .env.docker up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

# Wait for postgres to be healthy
echo "🐘 Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker compose ps postgres | grep -q "(healthy)"; then
        echo "✅ PostgreSQL is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ PostgreSQL failed to become healthy"
        docker compose logs postgres
        exit 1
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

# Wait for redis to be healthy
echo "🔴 Waiting for Redis..."
for i in {1..30}; do
    if docker compose ps redis | grep -q "(healthy)"; then
        echo "✅ Redis is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Redis failed to become healthy"
        docker compose logs redis
        exit 1
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

# Wait for api to be healthy
echo "🚀 Waiting for API..."
for i in {1..30}; do
    if docker compose ps api | grep -q "(healthy)"; then
        echo "✅ API is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ API failed to become healthy"
        docker compose logs api
        exit 1
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

echo ""
echo "🗄️  Running Prisma migrations..."
docker compose exec -T api npx prisma migrate deploy

echo ""
echo "========================================="
echo "✅ Flyby stack is up and running!"
echo "========================================="
echo ""
echo "📍 Services:"
echo "   - API:      http://localhost:3001"
echo "   - Health:   http://localhost:3001/api/health"
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis:    localhost:6379"
echo ""
echo "🛑 To stop: docker compose down"
echo "🔄 To restart: docker compose restart"
echo "📋 To view logs: docker compose logs -f"
echo ""