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

  plain_text_bindings = [
    { name = "DEPLOYMENT_NAME", value = var.deployment_name },
  ]

  # Provider keys are optional: the gateway enables a provider only when its key is
  # non-empty (dynamic, OpenRouter-style). Add more provider keys here as needed —
  # e.g. { name = "OPENROUTER_API_KEY", value = var.openrouter_api_key }.
  secrets = [
    { name = "TERMINUS_JWT_SECRET", value = var.terminus_jwt_secret },
    { name = "ANTHROPIC_API_KEY", value = var.anthropic_api_key },
    { name = "OPENAI_API_KEY", value = var.openai_api_key },
  ]

  compatibility_date  = "2024-09-23"
  compatibility_flags = ["nodejs_compat"]

  depends_on = [null_resource.terminus_build[0], module.terminus_kv[0]]
}
