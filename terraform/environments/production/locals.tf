locals {
  name_suffix = var.deployment_name

  # URLs for cross-service configuration
  control_plane_host = "open-inspect-control-plane-${local.name_suffix}.${var.cloudflare_worker_subdomain}.workers.dev"
  control_plane_url  = "https://${local.control_plane_host}"
  ws_url             = "wss://${local.control_plane_host}"
  terminus_host      = "open-inspect-terminus-${local.name_suffix}.${var.cloudflare_worker_subdomain}.workers.dev"
  terminus_url       = "https://${local.terminus_host}"

  # Worker script paths (deterministic output locations)
  control_plane_script_path = "${var.project_root}/packages/control-plane/dist/index.js"
  slack_bot_script_path     = "${var.project_root}/services/integrations/slack-bot/dist/index.js"
  linear_bot_script_path    = "${var.project_root}/services/integrations/linear-bot/dist/index.js"
  github_bot_script_path    = "${var.project_root}/services/integrations/github-bot/dist/index.js"
  terminus_script_path      = "${var.project_root}/services/terminus/dist/index.js"
}
