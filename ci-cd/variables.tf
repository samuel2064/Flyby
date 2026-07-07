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

variable "alert_email" {
  description = "Email address for CI/CD alert notifications"
  type = string
  default = "devops@example.com"
}

variable "github_actions_role_arn" {
  description = "IAM role ARN that GitHub Actions assumes for CI/CD operations"
  type = string
  # No default; must be provided via environment or GitHub variable
}

