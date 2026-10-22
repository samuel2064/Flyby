# Input variables for the Flyby Render IaC skeleton.
#
# Environment-specific values live in env/staging.tfvars and
# env/production.tfvars; secrets (render_api_key) must never be committed.

variable "render_api_key" {
  description = "Render API key used to provision resources. Set via TF_VAR_render_api_key or a secure backend, never in a tfvars file."
  type        = string
  sensitive   = true
}

variable "render_owner_id" {
  description = "Render workspace/owner id that owns the provisioned resources (Render Dashboard -> Workspace Settings)."
  type        = string
}

variable "app_name" {
  description = "Base name for all provisioned resources."
  type        = string
  default     = "flyby"
}

variable "environment" {
  description = "Deployment environment. Drives resource naming and NODE_ENV."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either \"staging\" or \"production\"."
  }
}

variable "region" {
  description = "Render region for the API service and database."
  type        = string
  default     = "oregon"
}

variable "branch" {
  description = "Git branch Render builds and auto-deploys from."
  type        = string
  default     = "main"
}

variable "repo_url" {
  description = "Git repository URL Render builds from."
  type        = string
  default     = "https://github.com/Company/Flyby"
}

variable "api_plan" {
  description = "Render instance plan for the API web service."
  type        = string
  default     = "starter"
}

variable "db_plan" {
  description = "Render plan for the PostgreSQL database (e.g. free, basic_256mb)."
  type        = string
  default     = "free"
}

variable "postgres_version" {
  description = "PostgreSQL major version."
  type        = string
  default     = "16"
}

variable "environment_id" {
  description = "Optional Render environment id to attach resources to a project environment. Leave null for standalone services."
  type        = string
  default     = null
}
