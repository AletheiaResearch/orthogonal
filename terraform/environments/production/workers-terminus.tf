# =============================================================================
# Terminus — LLM Gateway Worker (CON-41)
# =============================================================================

# Build the terminus worker bundle (only runs during apply, not plan)
resource "null_resource" "terminus_build" {
  count = var.enable_terminus ? 1 : 0

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command     = "pnpm run build"
    working_dir = "${var.project_root}/services/terminus"
  }
}

module "terminus_worker" {
  count  = var.enable_terminus ? 1 : 0
  source = "../../modules/cloudflare-worker"

  account_id  = var.cloudflare_account_id
  worker_name = "open-inspect-terminus-${local.name_suffix}"
  script_path = local.terminus_script_path

  kv_namespaces = [
    {
      binding_name = "MODELS_CACHE"
      namespace_id = module.terminus_kv[0].namespace_id
    }
  ]

  # Credential vault (CON-50) — Terminus owns provider/Codex credentials in its own D1.
  d1_databases = [
    {
      binding_name = "DB"
      database_id  = cloudflare_d1_database.terminus[0].id
    }
  ]

  plain_text_bindings = [
    { name = "DEPLOYMENT_NAME", value = var.deployment_name },
    # Guardrail policy seed (CON-71 L2; not a secret). Empty = no policy (pass-through);
    # else validated + lazy-seeded as platform-default v1, then managed via the admin API.
    { name = "TERMINUS_GATEWAY_POLICY", value = var.terminus_gateway_policy },
  ]

  # TERMINUS_JWT_SECRET + CREDENTIALS_ENCRYPTION_KEY are required. TERMINUS_ADMIN_SECRET
  # gates the credential ingestion/admin API (CON-70; empty disables it, fail-closed).
  # Provider keys are optional seeds (the vault enables a provider only when its key is
  # non-empty — dynamic, OpenRouter-style); CODEX_OAUTH_* seeds the platform Codex account.
  secrets = [
    { name = "TERMINUS_JWT_SECRET", value = var.terminus_jwt_secret },
    { name = "CREDENTIALS_ENCRYPTION_KEY", value = var.terminus_credentials_encryption_key },
    { name = "TERMINUS_ADMIN_SECRET", value = var.terminus_admin_secret },
    { name = "ANTHROPIC_API_KEY", value = var.anthropic_api_key },
    { name = "OPENAI_API_KEY", value = var.openai_api_key },
    { name = "CODEX_OAUTH_REFRESH_TOKEN", value = var.codex_oauth_refresh_token },
    { name = "CODEX_OAUTH_ACCOUNT_ID", value = var.codex_oauth_account_id },
  ]

  # Proactively refresh the Codex access token before it expires (scheduled handler).
  cron_triggers = ["*/5 * * * *"]

  compatibility_date  = "2024-09-23"
  compatibility_flags = ["nodejs_compat"]

  depends_on = [
    null_resource.terminus_build[0],
    module.terminus_kv[0],
    null_resource.terminus_d1_migrations[0],
  ]
}
