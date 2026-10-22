# Infrastructure as Code skeleton — Flyby on Render (staging + production).
#
# This module replaces the legacy AWS/Terraform pipeline in ../../ci-cd/
# (superseded by the Render free-tier decision, see TIR-179). It describes the
# same stack as the repo-root render.yaml Blueprint — an API web service, the
# Vite PWA static site, and a PostgreSQL database — but parameterized per
# environment so staging and production are provisioned from one definition.
#
# Usage:
#   terraform -chdir=infra init
#   terraform -chdir=infra validate
#   terraform -chdir=infra plan  -var-file=env/staging.tfvars
#   terraform -chdir=infra apply -var-file=env/production.tfvars
#
# See README.md for the required variables and the Render API key setup.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    render = {
      source  = "render-oss/render"
      version = "~> 1.9"
    }
  }
}

provider "render" {
  api_key  = var.render_api_key
  owner_id = var.render_owner_id
}

locals {
  name_prefix = "${var.app_name}-${var.environment}"
}

# PostgreSQL database. The connection string is injected into the API service
# below, mirroring render.yaml's `fromDatabase` wiring.
resource "render_postgres" "db" {
  name           = "${local.name_prefix}-db"
  plan           = var.db_plan
  version        = var.postgres_version
  region         = var.region
  environment_id = var.environment_id
}

# Backend API (Node). Same contract as render.yaml: build with prisma generate,
# run migrations before start, health-check /api/health.
resource "render_web_service" "api" {
  name               = "${local.name_prefix}-api"
  plan               = var.api_plan
  region             = var.region
  environment_id     = var.environment_id
  health_check_path  = "/api/health"
  pre_deploy_command = "npx prisma migrate deploy"
  start_command      = "npm start"

  runtime_source = {
    native_runtime = {
      auto_deploy    = true
      branch         = var.branch
      build_command  = "npm ci --omit=dev && npx prisma generate"
      repo_url       = var.repo_url
      runtime        = "node"
      root_directory = "apps/api"
    }
  }

  env_vars = {
    NODE_ENV = {
      value = var.environment == "production" ? "production" : "staging"
    }
    PORT = {
      value = "10000"
    }
    DATABASE_URL = {
      value = render_postgres.db.connection_info.internal_connection_string
    }
    JWT_SECRET = {
      generate_value = true
    }
  }
}

# Frontend PWA (Vite static site). SPA fallback rewrites all paths to
# index.html, matching the flyby-web service declared in render.yaml.
resource "render_static_site" "web" {
  name           = "${local.name_prefix}-web"
  branch         = var.branch
  build_command  = "npm ci && npm run build"
  repo_url       = var.repo_url
  root_directory = "apps/web"
  publish_path   = "dist"
  auto_deploy    = true
  environment_id = var.environment_id

  routes = [
    {
      type        = "rewrite"
      source      = "/*"
      destination = "/index.html"
    }
  ]

  env_vars = {
    VITE_API_BASE_URL = {
      value = "https://${local.name_prefix}-api.onrender.com"
    }
  }
}
