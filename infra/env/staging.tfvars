# Staging environment.
#
# Secrets are intentionally NOT stored here. Provide them out-of-band, e.g.:
#   export TF_VAR_render_api_key=...
#   export TF_VAR_render_owner_id=...
# Then: terraform -chdir=infra plan -var-file=env/staging.tfvars

environment = "staging"
branch      = "main"
region      = "oregon"
api_plan    = "starter"
db_plan     = "free"
repo_url    = "https://github.com/Company/Flyby"
# environment_id = "<render-environment-id>"   # optional project environment
