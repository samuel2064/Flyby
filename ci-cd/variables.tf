variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "artifact_bucket_name" {
  description = "Name of the S3 bucket for CI/CD artifacts"
  type        = string
  default     = "ci-cd-artifacts"
}

variable "github_repo_owner" {
  description = "GitHub repository owner (org or user). Used to scope OIDC trust to this repo only."
  type        = string
  default     = "flybyapp"
}

variable "github_repo_name" {
  description = "GitHub repository name. Used to scope OIDC trust to this repo only."
  type        = string
  default     = "flyby"
}

variable "alert_email" {
  description = "Email address for CI/CD alert notifications"
  type        = string
  default     = "devops@example.com"
}

variable "github_actions_role_arn" {
  description = "IAM role ARN that GitHub Actions assumes for CI/CD operations"
  type        = string
  # No default; must be provided via environment or GitHub variable
}

