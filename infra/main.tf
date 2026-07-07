terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "local" {}
}

provider "aws" {
  # Use dummy region; real credentials to be added later
  region = "us-east-1"
}

resource "aws_s3_bucket" "artifact_bucket" {
  bucket = "ci-cd-artifacts-${random_id.suffix.hex}"
  acl    = "private"
}

resource "random_id" "suffix" {
  byte_length = 8
}

resource "aws_iam_role" "ci_cd_role" {
  name = "ci-cd-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "ec2.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })
}
