# Action Required

- Set the GitHub repository variable `GITHUB_ACTIONS_ROLE_ARN` to the IAM role ARN created by the Terraform apply step (`github_actions_role`). This is required for the CI/CD pipeline to assume the correct role.
- **Action Needed:** Please provide AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) or run `terraform apply` to generate the IAM role ARN.
- Note: Terraform apply attempted locally failed due to missing AWS credentials. Please supply valid AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.
- @devops-team: Please provide the required AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) so the Terraform apply can succeed and the IAM role ARN can be retrieved.
- Assigned to: @devops-team
- **Comment:** @devops-team, please provide valid AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) to proceed with Terraform apply.
- **Status:** Blocked – awaiting AWS credentials from @devops-team.
- **Note:** Terraform apply failed due to missing AWS credentials.
- Ensure the variable `AWS_REGION` and `ARTIFACT_BUCKET_NAME` are also configured in the repository settings.
- **Action:** Awaiting AWS credentials from @devops-team.
