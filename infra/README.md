# Flyby Infrastructure as Code (Render)

Terraform skeleton that provisions the Flyby stack on [Render](https://render.com):
the API web service, the Vite PWA static site, and PostgreSQL — parameterized
per environment (`staging`, `production`).

This is the supported IaC path. It supersedes the legacy AWS/Terraform pipeline
in [`../ci-cd`](../ci-cd) (blocked on AWS costs and replaced by the Render
free-tier decision, see TIR-179). The repo-root [`render.yaml`](../render.yaml)
remains the source of truth for the initial Blueprint deploy; this module mirrors
it for programmatic multi-environment management.

## What it creates

| Resource | Terraform type | Notes |
| --- | --- | --- |
| PostgreSQL database | `render_postgres` | connection string injected into the API |
| API web service | `render_web_service` | Node runtime, `apps/api`, health check `/api/health`, runs `prisma migrate deploy` before start |
| Frontend static site | `render_static_site` | Vite build of `apps/web`, SPA rewrite `/* -> /index.html` |

## Prerequisites

- Terraform >= 1.5
- A Render API key: Render Dashboard → **Account Settings → API Keys**
- Your Render workspace/owner id: **Workspace Settings → Workspace ID**

Provide secrets via environment variables (never commit them):

```bash
export TF_VAR_render_api_key="rnd_..."
export TF_VAR_render_owner_id="tea-..."
```

## Usage

```bash
terraform init
terraform validate
terraform plan  -var-file=env/staging.tfvars
terraform apply -var-file=env/staging.tfvars
```

For production, swap in `env/production.tfvars`.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `render_api_key` | yes | — | Render API key (sensitive) |
| `render_owner_id` | yes | — | Render workspace/owner id |
| `environment` | yes | — | `staging` or `production` |
| `app_name` | no | `flyby` | Resource name prefix |
| `region` | no | `oregon` | Render region |
| `branch` | no | `main` | Auto-deploy branch |
| `repo_url` | no | `https://github.com/Company/Flyby` | Source repo |
| `api_plan` | no | `starter` | API instance plan |
| `db_plan` | no | `free` | PostgreSQL plan |
| `postgres_version` | no | `16` | PostgreSQL major version |
| `environment_id` | no | `null` | Optional Render project environment id |

## State

State is local by default for this skeleton. Before team use, configure a remote
backend (e.g. Terraform Cloud, S3, or a Render-managed store) and commit the
backend block; do not commit `.tfstate` files.

## Related tickets

- [TIR-353](/TIR/issues/TIR-353) — Set up CI/CD pipeline and IaC skeleton
- [TIR-179](/TIR/issues/TIR-179) — Render deployment (superseded the AWS pipeline)
- [TIR-85](/TIR/issues/TIR-85) — Original Terraform IaC skeleton
