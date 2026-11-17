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

## Deployment topology (TIR-409)

| Render service | Service id | Type |
| --- | --- | --- |
| `flyby-web` | `srv-dapocsugekts73ek60t0` | static site (`apps/web`, publishes `dist`) |
| `flyby-api` | `srv-dak58lm1egvs73957l50` | web service (`apps/api`, health check `/api/health`) |

Both services live in the Render workspace `tea-8gnu3reo5us7384la60`, which is
shared with the nightlamp project. A Render API key is **workspace-wide**, so it
can deploy nightlamp services too. This repo therefore stores **no Render
credentials at all** (`Actions secrets` for this repo is empty): Flyby CI can no
longer reach the nightlamp services.

How a change reaches production:

1. A pull request merges into `main` after the CI checks pass.
2. The nightlamp ops repo (`samuel2064/nightlamp`,
   `.github/workflows/deploy-flyby.yml`) polls this repo's `main` commit every
   5 minutes, checks that the latest CI run for that exact commit succeeded,
   then triggers the Render deploys for the two service ids above, waits for
   `live`, and verifies the eight production endpoints.
3. `.github/workflows/render-deploy.yml` in this repo holds no credential, so it
   only verifies production. If per-service Render deploy hooks are ever added
   (they are dashboard-only in Render), it deploys through those hooks instead.

Known limitation: both this poll and the keep-alive schedule
(`.github/workflows/keepalive.yml`) run on GitHub's scheduler, which drops most
cron ticks on this account (2 scheduled runs in the 10 hours after
2026-11-17T02:30Z, with no skipped runs and no Actions minutes overage). A
merge can therefore take longer than the nominal 5 minutes to reach production;
the DevOps agent also dispatches the ops workflow after merges, and re-authorizing
the Render GitHub App for this repo would remove the dependency entirely.

Render's own auto-deploy is configured (`autoDeployTrigger: commit` in
`render.yaml`, applied to both services) but does not fire for this repo: the
Render GitHub App is authorized for `samuel2064/nightlamp` only, so Render
receives no push events for `samuel2064/Flyby`. Re-authorizing the app for this
repo (Render dashboard) would let Render deploy on push again.

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
