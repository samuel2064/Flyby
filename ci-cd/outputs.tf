output "artifact_bucket_name" {
  description = "The name of the S3 bucket for artifacts"
  value       = aws_s3_bucket.artifact_bucket.id
}

output "artifact_bucket_arn" {
  description = "The ARN of the S3 bucket for artifacts"
  value       = aws_s3_bucket.artifact_bucket.arn
}

output "github_actions_role_arn" {
  description = "ARN of the IAM role used by GitHub Actions"
  value       = aws_iam_role.github_actions_role.arn
}

// The inline IAM policy does not have a distinct ARN. This output is omitted.
