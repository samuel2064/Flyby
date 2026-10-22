# Flyby CI/CD Pipeline

Continuous integration, infrastructure as code, and automated deployment for the
Flyby MVP (API + web PWA). Deployment is handled by **Render auto-deploy**; no
cloud credentials or static secrets are required in CI.

## Pipeline overview

```
 push / PR to main
        │
        ├── CI (ci.yml)              backend: install -> syntax check -> tests -> boot & health -> contract checks -> Docker build
        ├── Web CI (web-ci.yml)      frontend: install -> tsc --noEmit -> vite build -> publish dist artifact
        └── (path-filtered)          each job only runs when its app changes
        │
 push to main (Render)
        │
        ├── flyby-api   Render builds apps/api, runs `prisma migrate deploy`, serves /api/health
        └── flyby-web   Render builds apps/web, serves the Vite PWA with SPA fallback
        │
 Live API smoke check (live-smoke.yml)   every 15 min + manual: probes the deployed API and product routes
```

## Workflows

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| CI | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | push/PR to `main` | Backend tests, API contract checks (wait-times 404, admin delete, forecasts), and Docker image build validation |
| Web CI | [`.github/workflows/web-ci.yml`](../.github/workflows/web-ci.yml) | push/PR to `main`, `apps/web/**` | Frontend typecheck + production build; uploads `flyby-web-dist` artifact |
| Live API smoke check | [`.github/workflows/live-smoke.yml`](../.github/workflows/live-smoke.yml) | schedule `*/15 * * * *` + manual | Probes `https://flyby-api.onrender.com` for health and product-route regressions (catches stale/bad deploys) |

## Deployment — Render

Deployment is declared as code in the repo-root [`render.yaml`](../render.yaml)
Blueprint: `flyby-api` (Node web service), `flyby-web` (static site), and
`flyby-db` (PostgreSQL). With `autoDeploy: true`, **every push to `main` builds
and deploys automatically** — this is the "deployment" stage of the pipeline, so
there is no separate deploy workflow.

Operator steps for the first deploy (board actions) are in
[`RENDER_DEPLOY.md`](../RENDER_DEPLOY.md).

### Verification after deploy

- Health: `curl -fsS https://flyby-api.onrender.com/api/health` -> `200`
- Web: `curl -fsS https://flyby-web.onrender.com/` -> `200`
- Automated: the scheduled `live-smoke.yml` run (or trigger it manually via
  **Actions -> Live API smoke check -> Run workflow**).

## Infrastructure as Code

| Location | Scope | Status |
| --- | --- | --- |
| [`render.yaml`](../render.yaml) | Production Blueprint (API + web + DB) | Active — source of truth for the live deploy |
| [`infra/`](../infra/README.md) | Terraform skeleton for `staging` + `production` (Render provider) | Active — programmatic multi-env provisioning |
| [`ci-cd/`](../ci-cd) | Legacy AWS Terraform (S3 artifacts, IAM/OIDC, CloudWatch) | Deprecated — superseded by Render (TIR-179); kept for history |

Terraform commands:

```bash
terraform -chdir=infra init
terraform -chdir=infra validate
terraform -chdir=infra plan -var-file=env/staging.tfvars
```

## Environments

| Environment | API | Web | Database | Branch |
| --- | --- | --- | --- | --- |
| staging | `flyby-staging-api` | `flyby-staging-web` | `flyby-staging-db` | `main` |
| production | `flyby-production-api` / `flyby-api` | `flyby-production-web` / `flyby-web` | `flyby-production-db` / `flyby-db` | `main` |

Staging and production are provisioned from `infra/env/staging.tfvars` and
`infra/env/production.tfvars`. Promote by reviewing the staging smoke checks,
then applying the production tfvars (or merging to the production Blueprint).

## Secrets

| Secret | Where |
| --- | --- |
| `JWT_SECRET` | Render-generated (`generateValue`); never in the repo |
| `DATABASE_URL` | Injected by Render from the `flyby-db` database block |
| `ADMIN_API_KEY` | Render service env var only (enables `DELETE /api/reports/:id`; fail-closed `503` when unset) |
| `TF_VAR_render_api_key` | Terraform operator environment only |
| `TF_VAR_render_owner_id` | Terraform operator environment only |

## Adding a new check

1. Add the step to the matching workflow (backend -> `ci.yml`, frontend ->
   `web-ci.yml`).
2. Add any deployed-route regression to `live-smoke.yml` so it is caught live.
3. Keep path filters current so unrelated changes do not burn CI minutes.

## Related tickets

- [TIR-353](/TIR/issues/TIR-353) — this pipeline + IaC skeleton
- [TIR-90](/TIR/issues/TIR-90) — CI/CD architecture
- [TIR-92](/TIR/issues/TIR-92) — GitHub Actions workflows
- [TIR-179](/TIR/issues/TIR-179) — Render deployment
- [TIR-301](/TIR/issues/TIR-301) — scheduled live smoke check
