# Setup Actions Required (External Blockers)

The CI/CD pipeline infrastructure and workflow files are committed and validated.
To complete an end-to-end pipeline run, two external blockers must be resolved by the board/CEO/AWS account owner:

## 1. AWS credentials (for initial Terraform bootstrap)

`terraform apply` needs write access to AWS so it can create:
- `aws_s3_bucket.artifact_bucket` (S3 artifact store)
- `aws_iam_role.github_actions_role` (IAM role GitHub Actions will assume via OIDC)
- CloudWatch Log Group, metric filter, alarm, and SNS topic

Two mutually exclusive options unblock this:
- **Recommended (OIDC, no static keys):** Provision an IAM OIDC identity provider for `actions.githubusercontent.com` once, then the IAM role resource in `main.tf` creates the role GitHub Actions assumes. This requires AWS credentials to run the bootstrap only the first time.
- **Alternative:** Provide `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` to a user with `terraform apply` rights, scoped to the resources above.

## 2. Repository access (to push these configs to the Flyby repo)

The pipeline files (`.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `ci-cd/*.tf`) live only in this workspace right now. To trigger the workflow on push, they need to be committed to `https://github.com/flybyapp/flyby` (the staging target). Either:
- Grant the DevOps agent collaborator rights on the repo, or
- A human with write access pushes these files for us.

## GitHub repository variables required after role creation

Once `terraform apply` outputs the role ARN, set these GitHub repo variables before the first push-triggered run:

- `GITHUB_ACTIONS_ROLE_ARN`  -> `terraform output github_actions_role_arn`
- `AWS_REGION`               -> e.g. `us-east-1`
- `ARTIFACT_BUCKET_NAME`     -> same value as `var.artifact_bucket_name` (default `ci-cd-artifacts`)

## What is done (working, validated)

- `ci-cd/main.tf`           : S3 bucket (versioning + SSE + public-access block), IAM role scoped to the Flyby repo staging environment via OIDC `sub` claim, inline policy grants S3 + SNS Publish.
- `ci-cd/variables.tf`      : `aws_region`, `artifact_bucket_name`, `github_repo_owner`, `github_repo_name`, `alert_email`, `github_actions_role_arn`.
- `ci-cd/cloudwatch.tf`     : SNS topic + email subscription, CloudWatch Logs group `/flyby/ci-cd`, metric filter on `ERROR`, alarm `ci-cd-pipeline-failure`.
- `ci-cd/outputs.tf`        : bucket name, bucket ARN, role ARN.
- `.github/workflows/ci.yml` : checkout -> setup terraform -> assume role via OIDC -> terraform init/apply -> test -> build artifact -> deploy to S3 -> on failure, publish log to CloudWatch (fires the alarm).
- `.github/workflows/deploy.yml` : Terraform-only trigger when `ci-cd/**` changes.

`terraform -chdir=ci-cd validate` passes with 0 errors on the hardened configuration.
