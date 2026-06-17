# =============================================================================
# Provider Authentication
# =============================================================================

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers, KV, R2, and D1 permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID (optional, for custom domains)"
  type        = string
  default     = null
}

variable "cloudflare_worker_subdomain" {
  description = "Cloudflare Workers account subdomain (e.g. 'myaccount' — .workers.dev is appended automatically)"
  type        = string
}

variable "modal_token_id" {
  description = "Modal API token ID"
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = length(trimspace(var.modal_token_id)) > 0
    error_message = "modal_token_id must be set."
  }
}

variable "modal_token_secret" {
  description = "Modal API token secret"
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = length(trimspace(var.modal_token_secret)) > 0
    error_message = "modal_token_secret must be set."
  }
}

variable "modal_workspace" {
  description = "Modal workspace name"
  type        = string
  default     = ""

  validation {
    condition     = length(trimspace(var.modal_workspace)) > 0
    error_message = "modal_workspace must be set."
  }
}

variable "modal_environment" {
  description = "Modal environment name used by the Modal CLI"
  type        = string
  default     = "main"

  validation {
    condition     = length(trimspace(var.modal_environment)) > 0 && can(regex("^[^:/\\\\]+$", var.modal_environment))
    error_message = "modal_environment must be set and must not contain colons, slashes, or backslashes."
  }
}

variable "modal_environment_web_suffix" {
  description = "Modal environment web suffix used in endpoint URLs. Use lowercase letters, digits, and dashes, or leave empty for the environment with no web suffix."
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^$|^[a-z0-9-]+$", var.modal_environment_web_suffix))
    error_message = "modal_environment_web_suffix must be empty or contain only lowercase letters, digits, and dashes."
  }
}

# =============================================================================
# GitHub OAuth App Credentials
# =============================================================================

variable "github_client_id" {
  description = "GitHub OAuth App client ID"
  type        = string
}

variable "github_client_secret" {
  description = "GitHub OAuth App client secret"
  type        = string
  sensitive   = true
}

# =============================================================================
# GitHub App Credentials (for Modal sandbox)
# =============================================================================

variable "github_app_id" {
  description = "GitHub App ID"
  type        = string
}

variable "github_app_private_key" {
  description = "GitHub App private key (PKCS#8 format)"
  type        = string
  sensitive   = true
}

variable "github_app_installation_id" {
  description = "GitHub App installation ID"
  type        = string
}

variable "github_app_installation_map" {
  description = "Map of GitHub owner login to GitHub App installation ID"
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for owner, installation_id in var.github_app_installation_map :
      can(regex("^[a-zA-Z0-9-]+$", owner)) &&
      can(tonumber(trimspace(installation_id)))
    ])
    error_message = "github_app_installation_map must use GitHub owner-login keys (alphanumeric and hyphens) and numeric installation ID string values."
  }
}

# =============================================================================
# GitHub Bot Configuration
# =============================================================================

variable "enable_github_bot" {
  description = "Enable the GitHub bot worker. Requires github_webhook_secret and github_bot_username."
  type        = bool
  default     = false

  validation {
    condition     = var.enable_github_bot == false || (length(var.github_webhook_secret) > 0 && length(var.github_bot_username) > 0)
    error_message = "When enable_github_bot is true, github_webhook_secret and github_bot_username must be non-empty."
  }
}

variable "github_webhook_secret" {
  description = "Shared secret for verifying GitHub webhook signatures (generate with: openssl rand -hex 32)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_bot_username" {
  description = "GitHub App bot username for @mention detection (e.g., 'my-app[bot]')"
  type        = string
  default     = ""
}

# =============================================================================
# Slack App Credentials
# =============================================================================

variable "enable_slack_bot" {
  description = "Enable the Slack bot worker. Set to false to skip deployment."
  type        = bool
  default     = true

  validation {
    condition     = var.enable_slack_bot == false || (length(var.slack_bot_token) > 0 && length(var.slack_signing_secret) > 0)
    error_message = "When enable_slack_bot is true, slack_bot_token and slack_signing_secret must be non-empty."
  }
}

variable "slack_bot_token" {
  description = "Slack Bot OAuth token (xoxb-...)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "slack_signing_secret" {
  description = "Slack app signing secret"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# Linear Agent Credentials
# =============================================================================

variable "enable_linear_bot" {
  description = "Enable the Linear bot worker. Requires linear_client_id, linear_client_secret, and linear_webhook_secret."
  type        = bool
  default     = false

  validation {
    condition = var.enable_linear_bot == false || (
      length(var.linear_client_id) > 0 &&
      length(var.linear_client_secret) > 0 &&
      length(var.linear_webhook_secret) > 0
    )
    error_message = "When enable_linear_bot is true, linear_client_id, linear_client_secret, and linear_webhook_secret must be non-empty."
  }
}

variable "linear_client_id" {
  description = "Linear OAuth Application Client ID (from Settings → API → Applications)"
  type        = string
  default     = ""
}

variable "linear_client_secret" {
  description = "Linear OAuth Application Client Secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "linear_webhook_secret" {
  description = "Linear webhook signing secret (from the OAuth Application config)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "linear_api_key" {
  description = "Linear API key for fallback comment posting"
  type        = string
  default     = ""
  sensitive   = true
}

# =============================================================================
# Terminus LLM Gateway (CON-41)
# =============================================================================

variable "enable_terminus" {
  description = "Enable the Terminus LLM gateway worker. Requires terminus_jwt_secret."
  type        = bool
  default     = false

  validation {
    condition = var.enable_terminus == false || (
      length(trimspace(var.terminus_jwt_secret)) > 0 &&
      length(trimspace(var.terminus_credentials_encryption_key)) > 0
    )
    error_message = "When enable_terminus is true, terminus_jwt_secret and terminus_credentials_encryption_key must be non-empty."
  }
}

variable "terminus_jwt_secret" {
  description = "HS256 secret Terminus uses to verify sandbox gateway tokens (generate with: openssl rand -base64 32)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "terminus_credentials_encryption_key" {
  description = "Base64 AES-256 key encrypting Terminus credential-vault secrets at rest (generate with: openssl rand -base64 32)"
  type        = string
  default     = ""
  sensitive   = true

  validation {
    # Empty when the gateway is off; otherwise a base64-encoded 32-byte key (44 chars).
    condition = (
      var.terminus_credentials_encryption_key == "" ||
      can(regex("^[A-Za-z0-9+/]{43}=$", var.terminus_credentials_encryption_key))
    )
    error_message = "terminus_credentials_encryption_key must be a base64-encoded 32-byte key (openssl rand -base64 32)."
  }
}

variable "codex_oauth_refresh_token" {
  description = "ChatGPT/Codex OAuth refresh token seeded into the Terminus vault (optional; from a local OpenCode login)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "codex_oauth_account_id" {
  description = "ChatGPT account id paired with codex_oauth_refresh_token (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

# =============================================================================
# API Keys
# =============================================================================

variable "anthropic_api_key" {
  description = "Anthropic API key for Claude"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI platform API key (optional; enables openai/* models at the Terminus gateway)"
  type        = string
  default     = ""
  sensitive   = true
}

# =============================================================================
# Security Secrets
# =============================================================================

variable "token_encryption_key" {
  description = "Key for encrypting tokens (generate with: openssl rand -base64 32)"
  type        = string
  sensitive   = true
}

variable "repo_secrets_encryption_key" {
  description = "Key for encrypting repo secrets in D1 (generate with: openssl rand -base64 32)"
  type        = string
  sensitive   = true
}

variable "internal_callback_secret" {
  description = "Shared secret for internal service communication (generate with: openssl rand -base64 32)"
  type        = string
  sensitive   = true
}

variable "modal_api_secret" {
  description = "Shared secret for authenticating control plane to Modal API calls (generate with: openssl rand -hex 32)"
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = length(trimspace(var.modal_api_secret)) > 0
    error_message = "modal_api_secret must be set."
  }
}

# =============================================================================
# Configuration
# =============================================================================

variable "web_app_url" {
  description = "Production URL of the apps/orto web app (e.g. https://my-orto-app.vercel.app). orto self-deploys on its own Vercel dashboard project — it is NOT managed by Terraform. This URL is consumed as WEB_APP_URL by the control-plane, slack-bot, and linear-bot workers."
  type        = string

  validation {
    condition     = length(trimspace(var.web_app_url)) > 0
    error_message = "web_app_url must be set to the apps/orto production URL."
  }
}

variable "deployment_name" {
  description = "Unique deployment name used in URLs and resource names. Use something unique like your GitHub username or company name (e.g., 'acme', 'johndoe')."
  type        = string
}

variable "app_name" {
  description = "Display name shown in the web UI tab title, sign-in page, bot messages (Slack, Linear), PR body footer, and outbound HTTP User-Agent headers."
  type        = string
  default     = "Open-Inspect"
}

variable "enable_durable_object_bindings" {
  description = "Enable DO bindings. For initial deployment: set to false (applies migrations), then set to true (adds bindings)."
  type        = bool
  default     = true
}

variable "control_plane_migration_tag" {
  description = "Current migration tag for control plane DO migrations"
  type        = string
  default     = "v1"
}

variable "control_plane_migration_old_tag" {
  description = "Previous migration tag for control plane DO migrations (null for fresh deployments)"
  type        = string
  default     = null
}

variable "control_plane_new_sqlite_classes" {
  description = "DO classes new in this control plane migration step (empty means treat all configured classes as new)"
  type        = list(string)
  default     = []
}

variable "enable_service_bindings" {
  description = "Enable service bindings. Set false for initial deployment if target workers don't exist yet."
  type        = bool
  default     = true
}

variable "project_root" {
  description = "Root path to the project repository"
  type        = string
  default     = "../../../"
}

# =============================================================================
# R2 Storage
# =============================================================================

variable "r2_media_location" {
  description = "Cloudflare R2 location hint for the media bucket (e.g. ENAM, WNAM, APAC, WEUR, EEUR)"
  type        = string
  default     = "ENAM"
}

variable "r2_media_bucket_name" {
  description = "Override the R2 media bucket name. Leave empty to use the default 'open-inspect-media-<deployment_name>'. Set this when the bucket must be pre-created out-of-band (e.g. when the Terraform credentials cannot create R2 buckets)."
  type        = string
  default     = ""
}
