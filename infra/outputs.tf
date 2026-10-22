# Outputs from the Flyby Render IaC skeleton.

output "api_service_name" {
  description = "Name of the provisioned API web service."
  value       = render_web_service.api.name
}

output "api_url" {
  description = "Public URL of the API web service."
  value       = render_web_service.api.url
}

output "web_site_name" {
  description = "Name of the provisioned frontend static site."
  value       = render_static_site.web.name
}

output "web_url" {
  description = "Public URL of the frontend static site."
  value       = render_static_site.web.url
}

output "database_name" {
  description = "Name of the provisioned PostgreSQL database."
  value       = render_postgres.db.name
}

output "database_internal_connection_string" {
  description = "Internal PostgreSQL connection string for in-region access."
  value       = render_postgres.db.connection_info.internal_connection_string
  sensitive   = true
}
