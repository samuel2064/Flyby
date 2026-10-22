# CI/CD Setup — Remaining External Actions

The CI/CD pipeline and IaC are implemented and validated in this repo. Two
things still require board/human action to be fully live:

## 1. Repository access (to run the workflows)

The workflows (`.github/workflows/ci.yml`, `web-ci.yml`, `live-smoke.yml`) and
IaC (`infra/`, `render.yaml`) must be on `main` of the deployed repository. If
they are only in this workspace, either:
- grant the DevOps agent collaborator rights on the repo, or
- have a human with write access push them.

## 2. Render setup (board, one-time)

See [`../RENDER_DEPLOY.md`](../RENDER_DEPLOY.md). Summary:
1. Create a Render account (free tier).
2. Connect the GitHub repo to Render via OAuth.
3. Apply the Blueprint at `https://dashboard.render.com/blueprint/new?repo=<repo>`.

Once connected, pushes to `main` auto-deploy `flyby-api` and `flyby-web`; no AWS
credentials are needed.

## What is done (working, validated)

- `.github/workflows/ci.yml` — backend tests, API contract checks, Docker build validation.
- `.github/workflows/web-ci.yml` — frontend typecheck + Vite build, artifact upload.
- `.github/workflows/live-smoke.yml` — scheduled live API regression probe.
- `render.yaml` — production Blueprint (API + static site + PostgreSQL), auto-deploy on `main`.
- `infra/` — Terraform skeleton for staging + production (Render provider); `terraform validate` passes.
- `docs/CI-CD.md` — full pipeline documentation.

## Legacy (deprecated)

- `ci-cd/*.tf` — AWS Terraform (S3/IAM/CloudWatch). Superseded by the Render
  free-tier decision ([TIR-179](/TIR/issues/TIR-179)); kept for history, no
  longer part of the active pipeline.
