// Terraform configuration for CI/CD pipeline infrastructure

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "artifact_bucket" {
  bucket = var.artifact_bucket_name
  acl    = "private"

  versioning {
    enabled = true
  }
}

resource "aws_iam_role" "github_actions_role" {
  name = "github-actions-ci-cd-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {"Service": "actions.githubusercontent.com"},
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}


resource "aws_iam_role_policy" "github_actions_policy" {
  name = "github-actions-ci-cd-policy"
  role = aws_iam_role.github_actions_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      Resource = [
        aws_s3_bucket.artifact_bucket.arn,
        "${aws_s3_bucket.artifact_bucket.arn}/*"
      ]
    }]
  })
}
