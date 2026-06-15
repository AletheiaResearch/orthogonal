# Getting Started with Open-Inspect

This guide walks you through deploying your own instance of Open-Inspect using Terraform.

> Looking for local development setup (without full infra deployment)? Start with
> [SETUP_GUIDE.md](./SETUP_GUIDE.md).

> **Important**: This system is designed for **single-tenant deployment only**. All users share the
> same GitHub App credentials and can access any repository the App is installed on. See the
> [Security Model](../README.md#security-model-single-tenant-only) for details.

---

## Overview

Open-Inspect uses Terraform to automate deployment across multiple cloud providers:

| Provider       | Purpose                                     | What Terraform Creates                               |
| -------------- | ------------------------------------------- | ---------------------------------------------------- |
| **Cloudflare** | Control plane, session state                | Workers, KV namespaces, Durable Objects, D1 Database |
| **Modal**      | Sandbox execution infrastructure (required) | Modal app deployment via Terraform                   |

> **Web app**: The web client is `apps/orto` (Next.js, with PostHog analytics). It deploys via its
> own dashboard-managed Vercel project and is **not** managed by Terraform — see
> [apps/orto/README.md](../apps/orto/README.md).

**Your job**: Create accounts, gather credentials, and configure one file (`terraform.tfvars`).
**Terraform's job**: Create all infrastructure and configure services.

---

## Prerequisites

### Required Accounts

Create accounts on these services before continuing:

| Service                                          | Purpose                           |
| ------------------------------------------------ | --------------------------------- |
| [Cloudflare](https://dash.cloudflare.com)        | Control plane hosting             |
| [Vercel](https://vercel.com)                     | Web app hosting (`apps/orto`)     |
| [Modal](https://modal.com)                       | Sandbox infrastructure (required) |
| [GitHub](https://github.com/settings/developers) | OAuth + repository access         |
| [Anthropic](https://console.anthropic.com)       | Claude API                        |
| [Slack](https://api.slack.com/apps) _(optional)_ | Slack bot integration             |
| GitHub App Webhooks _(optional)_                 | GitHub bot (PR reviews)           |

### Required Tools

```bash
# Terraform (1.9.0+)
brew install terraform

# Node.js (22+)
brew install node@22

# Python 3.12+ and uv (Modal CLI is installed via uv sync below)
brew install python@3.12 uv

# Wrangler CLI (for initial R2 bucket setup)
corepack enable
pnpm add -g wrangler
```

---

## Step 1: Fork the Repository

Fork [ColeMurray/background-agents](https://github.com/ColeMurray/background-agents) to your GitHub
account or organization.

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/background-agents.git
cd background-agents
corepack enable
pnpm install

# Build the shared package (required before Terraform deployment)
pnpm --filter @open-inspect/shared build

# Install Python dependencies for Modal deployment (includes sandbox-runtime)
cd packages/modal-infra && uv sync --frozen && cd -
```

---

> **Tip**: Before proceeding, copy `terraform/environments/production/terraform.tfvars.example` to
> `terraform.tfvars` and keep it open. As you collect credentials in the following steps, paste them
> directly into this file.

---

## Step 2: Create Cloud Provider Credentials

### Cloudflare

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Note your Account ID** (visible in the dashboard URL or account overview)
3. **Note your Workers subdomain**: Go to Workers & Pages → Overview, look in the **bottom-right**
   of the panel for `*.YOUR-SUBDOMAIN.workers.dev`
4. **Create API Token** at [API Tokens](https://dash.cloudflare.com/profile/api-tokens):
   - Use template: "Edit Cloudflare Workers"
   - Verify it has these permissions:
     - Account | Workers KV Storage | Edit (should be included with template)
     - Account | Workers R2 Storage | Edit (should be included with template)
     - Account | D1 | Edit
   - Set "Account Resources" to include your account
   - Set "Zone Resources" to include all zones from your account
   - Click "Continue to summary" and "Update token"
5. **Enable R2**: Must add payment info, but first 10 GB/month is free

### Cloudflare R2 (Terraform State Backend)

Terraform needs a place to store its state. We use Cloudflare R2.

```bash
# Login to Cloudflare
wrangler login


# Create the state bucket
wrangler r2 bucket create open-inspect-terraform-state
```

Create an R2 API Token:

1. Go to R2 → Overview → Manage R2 API Tokens
2. Create token with **Object Read & Write** permission
3. Note the **Access Key ID** and **Secret Access Key**

### Vercel

The web app (`apps/orto`) deploys via its own dashboard-managed Vercel project, not Terraform — so
no Vercel API token is needed for the Terraform deploy below. You only need a Vercel account; set
the project up later (see [Step 8](#step-8-deploy-the-web-app) and
[apps/orto/README.md](../apps/orto/README.md)).

### Modal

Modal is required for all sandbox execution. See [sandbox-providers/](./sandbox-providers/README.md)
for migration history and notes on adding another backend.

1. Go to [Modal Settings](https://modal.com/settings)
2. **Create a new API token**: Settings -> API Tokens -> New Token
3. Note the **Token ID** and **Token Secret**
4. Note your **Workspace** and **Environment name** (visible in your Modal dashboard URL,
   https://modal.com/apps/<modal_workspace>/<modal_environment>)
5. Note the environment's **Web suffix** from Modal's environment settings. Use the normalized
   lowercase suffix made of letters, digits, and dashes. Leave it empty for the environment whose
   endpoints use `https://<workspace>--...modal.run`.

### Anthropic

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Create an API key
3. Note the **API Key** (starts with `sk-ant-`)

> **Want to use your OpenAI ChatGPT subscription?** See [Using OpenAI Models](OPENAI_MODELS.md) for
> setup instructions (can be configured after deployment).

---

## Step 3: Create GitHub App

You only need **one GitHub App** - it handles both user authentication (OAuth) and repository
access.

1. Go to [GitHub Apps](https://github.com/settings/apps)
2. Click **"New GitHub App"**
3. Fill in the basics:
   - **Name**: `Open-Inspect-YourName` (must be globally unique)
   - **Homepage URL**: Your web app URL (see below)
   - **Webhook**: Uncheck "Active" (not needed)
4. Configure **Identifying and authorizing users** (OAuth):
   - **Callback URL**: `{your-web-app-url}/api/auth/callback/github`

   Your web app URL is the domain of your deployed `apps/orto` Vercel project (see
   [apps/orto/README.md](../apps/orto/README.md)).

   > **Important**: The callback URL must match your deployed web app URL exactly. If you don't have
   > the final web app URL yet, you can come back and update the callback URL after deploying the
   > web app in [Step 8](#step-8-deploy-the-web-app).

5. Set **Repository permissions**:
   - Contents: **Read & Write**
   - Issues: **Read & Write** _(required if enabling GitHub bot)_
   - Pull requests: **Read & Write**
   - Metadata: **Read-only**
6. Click **"Create GitHub App"**
7. Note the **App ID** and **Client ID** (top of page)
8. Under **"Client secrets"**, click **"Generate a new client secret"** and note the **Client
   Secret**
9. Scroll down to **"Private keys"** and click **"Generate a private key"** (downloads a .pem file)
10. **Convert the key to PKCS#8 format** (required for Cloudflare Workers):
    ```bash
    openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
      -in ~/Downloads/your-app-name.*.private-key.pem \
      -out private-key-pkcs8.pem
    ```
11. **Install the app** on your account/organization:
    - Click "Install App" in the sidebar
    - Select the repositories you want Open-Inspect to access
12. Note the **Installation ID** from the URL after installing:
    ```
    https://github.com/settings/installations/INSTALLATION_ID
    ```

You should now have:

- **App ID** (e.g., `123456`)
- **Client ID** (e.g., `Iv1.abc123...`)
- **Client Secret** (e.g., `abc123...`)
- **Private Key** (PKCS#8 format, starts with `-----BEGIN PRIVATE KEY-----`)
- **Installation ID** (e.g., `12345678`)

---

## Step 4: Create Slack App (Optional)

Skip this step if you don't need Slack integration.

### Create the App

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Name it (e.g., `Open-Inspect`) and select your workspace

### Configure OAuth & Permissions

1. Go to **OAuth & Permissions** in the sidebar
2. Add **Bot Token Scopes**:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `channels:read`
   - `groups:history`
   - `groups:read`
   - `im:history`
   - `im:read`
   - `reactions:write`
3. Click **"Install to Workspace"**
4. Note the **Bot Token** (`xoxb-...`)

> **Important**: If you update bot token scopes later, you must **reinstall the app** to your
> workspace for the new permissions to take effect.

### Get Signing Secret

1. Go to **Basic Information**
2. Note the **Signing Secret**

### Event Subscriptions (Configure After Deployment)

Event Subscriptions require the Slack bot worker to be deployed first for URL verification. You'll
configure this in **Step 7b** after running Terraform.

---

## Step 5: Generate Security Secrets

Generate these random secrets (you'll need them for `terraform.tfvars`):

```bash
# Token encryption key
echo "token_encryption_key: $(openssl rand -base64 32)"

# Repo secrets encryption key
echo "repo_secrets_encryption_key: $(openssl rand -base64 32)"

# Internal callback secret
echo "internal_callback_secret: $(openssl rand -base64 32)"

# Modal API secret (use hex for this one)
echo "modal_api_secret: $(openssl rand -hex 32)"

# NextAuth secret — set as NEXTAUTH_SECRET in the apps/orto Vercel project env (not terraform.tfvars)
echo "NEXTAUTH_SECRET: $(openssl rand -base64 32)"

# GitHub webhook secret (only if enabling GitHub bot)
echo "github_webhook_secret: $(openssl rand -hex 32)"
```

Save these values somewhere secure—you'll need them in the next step.

---

## Step 6: Configure Terraform

```bash
cd terraform/environments/production

# Copy the example files
cp terraform.tfvars.example terraform.tfvars
cp backend.tfvars.example backend.tfvars
```

### Configure `backend.tfvars`

Fill in your R2 credentials:

```hcl
access_key = "your-r2-access-key-id"
secret_key = "your-r2-secret-access-key"
endpoints = {
  s3 = "https://YOUR_CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
}
```

### Configure `terraform.tfvars`

Fill in all the values you gathered. Here's the structure:

```hcl
# Provider Authentication
cloudflare_api_token        = "your-cloudflare-api-token"
cloudflare_account_id       = "your-account-id"
cloudflare_worker_subdomain = "your-subdomain"  # e.g., "twilight-unit-b2cf" (without .workers.dev)

# Modal (sandbox execution — required)
modal_token_id              = "your-modal-token-id"
modal_token_secret          = "your-modal-token-secret"
modal_workspace             = "your-modal-workspace"
modal_environment           = "your-modal-environment"
modal_environment_web_suffix = "your-modal-web-suffix" # Lowercase letters, digits, dashes; empty for https://workspace--... endpoints

# GitHub App (used for both OAuth and repository access)
github_client_id     = "Iv1.abc123..."           # From GitHub App settings
github_client_secret = "your-client-secret"      # Generated in GitHub App settings

github_app_id              = "123456"
github_app_installation_id = "12345678"

# Optional: map GitHub owner logins to additional installation IDs for the same App.
# Only needed when one deployment serves repos from multiple GitHub orgs/account installs.
# Unmapped owners fall back to github_app_installation_id above.
# github_app_installation_map = {
#   "other-org" = "87654321"
# }

github_app_private_key     = <<-EOF
-----BEGIN PRIVATE KEY-----
... paste your PKCS#8 key here ...
-----END PRIVATE KEY-----
EOF

# Slack (set enable_slack_bot = false to disable Slack integration)
enable_slack_bot     = false
slack_bot_token      = ""
slack_signing_secret = ""

# GitHub Bot (set enable_github_bot = true to deploy the webhook worker)
enable_github_bot      = false
github_webhook_secret  = ""          # From Step 5 (required if enabled)
github_bot_username    = ""          # e.g., "my-app[bot]" (your GitHub App's bot login)

# API Keys
anthropic_api_key = "sk-ant-..."

# Security Secrets (from Step 5)
token_encryption_key          = "your-generated-value"
repo_secrets_encryption_key   = "your-generated-value"
internal_callback_secret      = "your-generated-value"
modal_api_secret         = "your-generated-value"

# Configuration
# Production URL of the apps/orto web app — REQUIRED (consumed as WEB_APP_URL by the
# control-plane, slack-bot, and linear-bot workers). orto self-deploys on its own
# Vercel project, not via Terraform, so you won't have the final URL until Step 8.
# Use a placeholder for the first apply; in Step 8 you'll set the real URL and run
# `terraform apply` again to propagate it to the workers.
web_app_url = "https://<your-orto-app>.vercel.app"

# deployment_name is embedded in your Cloudflare Worker URLs (control plane + bots),
# so keep it unique within your account. Use your GitHub username, company name, or a
# random string.
deployment_name = "your-unique-name"  # e.g., "acme", "johndoe", "mycompany"
project_root    = "../../../"

# Branding (optional). app_name is the display name used in bot messages
# (Slack/Linear), the PR body footer, and the outbound HTTP User-Agent. The web
# UI's own branding (name, short label, logo/favicon) is set in the apps/orto
# Vercel project env — see "Customizing the App Name and Icon" below.
# app_name = "Open-Inspect"

# Initial deployment: set both to false (see Step 7)
enable_durable_object_bindings = false
enable_service_bindings        = false
```

> **Note**: Access control (`ALLOWED_USERS`, `ALLOWED_EMAIL_DOMAINS`, `UNSAFE_ALLOW_ALL_USERS`), the
> NextAuth secret, and the web UI branding live in the `apps/orto` Vercel project's environment
> variables (see [apps/orto/.env.example](../apps/orto/.env.example)), not in `terraform.tfvars`.
> Sign-in is denied when both allowlists are empty unless `UNSAFE_ALLOW_ALL_USERS=true`.

---

## Step 7: Deploy with Terraform

Deployment requires **two phases** due to Cloudflare's Durable Object and service binding
requirements.

### Phase 1: Initial Deployment

Ensure your `terraform.tfvars` has:

```hcl
enable_durable_object_bindings = false
enable_service_bindings        = false
```

**Important**: Build the workers before running Terraform (Terraform references the built bundles):

```bash
# From the repository root
pnpm --filter @open-inspect/control-plane --filter @orthogonal/slack-bot --filter @orthogonal/github-bot --filter @orthogonal/linear-bot build
```

Then run:

```bash
cd terraform/environments/production

# Initialize Terraform with backend config
terraform init -backend-config=backend.tfvars

# Deploy (phase 1 - creates workers without bindings)
terraform apply
```

### Phase 2: Enable Bindings

After Phase 1 succeeds, update your `terraform.tfvars`:

```hcl
enable_durable_object_bindings = true
enable_service_bindings        = true
```

Then run:

```bash
terraform apply
```

Terraform will update the workers with the required bindings.

---

## Step 7b: Complete Slack Setup (If Using Slack)

Now that the Slack bot worker is deployed, configure the App Home and Event Subscriptions.

### Enable App Home

The App Home provides a settings interface where users can configure their preferred model.

1. Go to [Slack Apps](https://api.slack.com/apps) -> Your Slack App → **App Home**
2. Under **Show Tabs**, toggle **"Home Tab"** to On

### Configure Event Subscriptions

1. Go to [Slack Apps](https://api.slack.com/apps) -> Your Slack App → **Event Subscriptions**
2. Toggle **"Enable Events"** to On
3. Enter **Request URL**:
   ```
   https://open-inspect-slack-bot-{deployment_name}.YOUR-SUBDOMAIN.workers.dev/events
   ```
   (Replace `YOUR-SUBDOMAIN` with your Cloudflare Workers subdomain and `{deployment_name}` with
   your deployment name from terraform.tfvars)
4. Wait for the green **"Verified"** checkmark
5. Under **Subscribe to bot events**, add:
   - `app_home_opened` (required for App Home settings)
   - `app_mention`
   - `message.channels` (optional - if you want the bot to see all channel messages)
   - `message.im` (enables direct message support)
6. Click **Save Changes**

### Configure Interactivity

1. Go to **Interactivity & Shortcuts**
2. Toggle **"Interactivity"** to On
3. Enter **Request URL**:
   ```
   https://open-inspect-slack-bot-{deployment_name}.YOUR-SUBDOMAIN.workers.dev/interactions
   ```
4. Click **Save Changes**

### Invite the Bot to Channels

In Slack, for each channel where you want the bot to respond:

- Type `/invite @YourBotName`, or
- Click the channel name → Integrations → Add apps

The bot only responds to @mentions in channels it has been invited to.

---

## Step 7c: Complete GitHub Bot Setup (If Using GitHub Bot)

Now that the GitHub bot worker is deployed, configure the GitHub App for webhook delivery.

### Configure Webhook on GitHub App

1. Go to your [GitHub App settings](https://github.com/settings/apps)
2. Select your Open-Inspect app
3. Under **Webhook**:
   - Check **"Active"**
   - **Webhook URL**:
     ```
     https://open-inspect-github-bot-{deployment_name}.YOUR-SUBDOMAIN.workers.dev/webhooks/github
     ```
     (Replace `YOUR-SUBDOMAIN` with your Cloudflare Workers subdomain and `{deployment_name}` with
     your deployment name from terraform.tfvars)
   - **Webhook secret**: Enter the `github_webhook_secret` value from your terraform.tfvars
4. Under **Subscribe to events**, check:
   - **Pull requests**
   - **Issue comments**
   - **Pull request review comments**
5. Click **Save changes**

### Find Your Bot Username

Your GitHub App's bot username is its slug with `[bot]` appended. You can find it by:

1. Having the bot perform any action (e.g., a PR review)
2. Checking the actor's login in the webhook payload

Or construct it from your App's slug: if your app is named `My-Inspect-App`, the bot username is
`my-inspect-app[bot]`. Ensure this matches the `github_bot_username` value in your terraform.tfvars.

### Usage

- **Code Review**: Open a non-draft PR in a repository where auto-review is enabled — it performs an
  automated review
- **Comment Actions**: @mention the bot in a PR comment with instructions (e.g.,
  `@my-app[bot] explain why this test is failing`)

For day-to-day workflows, see [GitHub Integration](./integrations/GITHUB.md).

---

## Step 8: Deploy the Web App

The web app (`apps/orto`) deploys via its own dashboard-managed Vercel project — it is **not**
created or deployed by Terraform. Follow the deployment instructions in
[apps/orto/README.md](../apps/orto/README.md) to create the Vercel project, set its root directory
and build commands, and configure its environment variables (the full set is in
[apps/orto/.env.example](../apps/orto/.env.example)).

Two of those env vars point at the control plane you just deployed — set them from the Terraform
outputs. If `CONTROL_PLANE_URL` is missing the app's API throws, and if `NEXT_PUBLIC_WS_URL` is
missing the client falls back to `localhost`, so the app would sign in but fail to create or stream
sessions:

```bash
cd terraform/environments/production
terraform output control_plane_url   # → set as CONTROL_PLANE_URL
terraform output ws_url              # → set as NEXT_PUBLIC_WS_URL (wss://...)
```

Also set `NEXTAUTH_SECRET` (from Step 5), `NEXTAUTH_URL` (the orto URL), the GitHub OAuth
credentials, and your `ALLOWED_USERS` / `ALLOWED_EMAIL_DOMAINS` access control — all listed in
`.env.example`.

Once deployed, note the project's URL, then:

1. Make sure your GitHub App's OAuth callback URL (`{your-web-app-url}/api/auth/callback/github`)
   matches it exactly (see Step 3).
2. Set `web_app_url` in `terraform.tfvars` to this real URL (replacing the Step 6 placeholder) and
   run `terraform apply` again. This propagates the URL to the control-plane, slack-bot, and
   linear-bot workers (`WEB_APP_URL`), which build "View Session" / PR deep-links from it — without
   the re-apply they keep the placeholder and those links break.

---

## Step 9: Verify Deployment

After deployment completes, verify each component:

```bash
# Get the verification commands from Terraform
terraform output verification_commands
```

Or manually:

```bash
# 1. Control Plane health check (replace {deployment_name} and YOUR-SUBDOMAIN)
curl https://open-inspect-control-plane-{deployment_name}.YOUR-SUBDOMAIN.workers.dev/health

# 2. Sandbox backend health check
# Modal exposes a health endpoint. Prefer the exact URL from terraform output verification_commands.
# Manual form: https://<workspace>[-<modal_environment_web_suffix>]--open-inspect-api-health.modal.run
MODAL_WORKSPACE_SLUG="YOUR-WORKSPACE" # or "YOUR-WORKSPACE-YOUR-MODAL-WEB-SUFFIX"
curl https://${MODAL_WORKSPACE_SLUG}--open-inspect-api-health.modal.run
```

For the web app, open your deployed `apps/orto` Vercel URL in a browser — it should return the
sign-in page.

### Test the Full Flow

1. Visit your web app URL
2. Sign in with GitHub
3. Create a new session with a repository
4. Send a prompt and verify the sandbox starts

---

## Updating Your Deployment

To update after pulling changes from upstream:

```bash
# Pull latest changes
git pull upstream main

# Rebuild shared package if it changed
pnpm --filter @open-inspect/shared build

# Re-run Terraform (it only changes what's needed)
cd terraform/environments/production
terraform apply
```

---

## Troubleshooting

### "Backend initialization required"

Re-run init with backend config:

```bash
terraform init -backend-config=backend.tfvars
```

### GitHub App authentication fails

1. Verify the private key is in PKCS#8 format (starts with `-----BEGIN PRIVATE KEY-----`)
2. Check the Installation ID matches your installation
3. Ensure the app has required permissions on the repository
4. Verify the callback URL matches your deployed web app URL exactly

### GitHub OAuth "redirect_uri is not associated with this application"

The callback URL in your GitHub App settings doesn't match your deployed URL. Update the callback
URL to match your deployed `apps/orto` Vercel URL exactly:

`{your-web-app-url}/api/auth/callback/github`

### Modal deployment fails

```bash
# Check Modal CLI is working (from packages/modal-infra)
cd packages/modal-infra
uv run modal token show

# View Modal logs
uv run modal app logs open-inspect
```

### Modal deployment fails with "No module named 'sandbox_runtime'"

The `sandbox_runtime` package is a sibling package that must be installed before deploying. From the
repository root:

```bash
cd packages/modal-infra && uv sync --frozen && cd -
```

This installs all Modal deployment dependencies including `sandbox_runtime` (resolved via
`[tool.uv.sources]` in `pyproject.toml`).

### Worker deployment fails / "no such file or directory" for dist/index.js

Terraform references the built worker bundles. Build them before running `terraform apply`:

```bash
# Build shared package first
pnpm --filter @open-inspect/shared build

# Build workers (required before Terraform)
pnpm --filter @open-inspect/control-plane --filter @orthogonal/slack-bot --filter @orthogonal/github-bot --filter @orthogonal/linear-bot build

# Verify bundles exist
ls packages/control-plane/dist/index.js
ls services/integrations/slack-bot/dist/index.js
ls services/integrations/github-bot/dist/index.js  # Only if enable_github_bot = true
ls services/integrations/linear-bot/dist/index.js  # Only if enable_linear_bot = true
```

### Slack bot not responding

1. Verify Event Subscriptions URL is verified (green checkmark)
2. Ensure the bot is invited to the channel (`/invite @BotName`)
3. Check that you're @mentioning the bot in your message
4. If you updated bot token scopes, reinstall the app to your workspace

### Slack bot ignores thread context

If the bot doesn't see the original message when tagged in a thread reply:

1. Verify the bot has `channels:history` scope (for public channels) and `groups:history` (for
   private channels). These are required by the `conversations.replies` API to fetch thread
   messages.
2. Verify the bot has `channels:read` and `groups:read` scopes. These are required by
   `conversations.info` to fetch channel name and description for context.
3. If you added missing scopes, **reinstall the app** to your workspace for the new permissions to
   take effect.

### GitHub bot not responding to webhooks

1. Verify the webhook URL matches
   `https://open-inspect-github-bot-{deployment_name}.YOUR-SUBDOMAIN.workers.dev/webhooks/github`
2. Check the webhook secret matches `github_webhook_secret` in terraform.tfvars
3. Confirm `enable_github_bot = true` in terraform.tfvars and the worker is deployed
4. Check that `github_bot_username` matches your App's bot login (e.g., `my-app[bot]`)
5. For PR reviews, ensure auto-review is enabled for the repository and the PR is not a draft
6. For comment actions, ensure the bot is @mentioned in a **PR** comment (not an issue)

See [Secrets Management](SECRETS.md) for more on global and repository secrets.

### Durable Objects / Service Binding errors

This occurs on first deployment. Follow the two-phase deployment process:

1. Deploy with `enable_durable_object_bindings = false` and `enable_service_bindings = false`
2. After success, set both to `true` and run `terraform apply` again

---

## Security Notes

- **Never commit** `terraform.tfvars` or `backend.tfvars` to source control
- The `.gitignore` already excludes these files
- Keep secrets in `terraform.tfvars` / `backend.tfvars`, not hardcoded in source
- Rotate secrets periodically using `terraform apply` after updating `terraform.tfvars`
- Review the [Security Model](../README.md#security-model-single-tenant-only) - this system is
  designed for single-tenant deployment

---

## Customizing the App Name and Icon (Optional)

Open-Inspect can be whitelabeled by overriding the brand name and logo. Both values are optional and
default to the built-in `Open-Inspect` brand.

Branding lives in two places.

**1. Bot / control-plane branding — `terraform.tfvars`.** `app_name` is read by the workers and used
in Slack App Home settings, Linear OAuth/completion messages, the PR body footer
(`Created with [<app_name>](<session-url>)`), and outbound HTTP User-Agent headers:

```hcl
app_name = "Acme Bot"
```

Run `terraform apply` after changing it; the bot/control-plane workers read `APP_NAME` at request
time and pick up the new value immediately.

**2. Web UI branding — `apps/orto` Vercel env.** The name, short label, and logo/favicon shown in
the web UI are `NEXT_PUBLIC_*` env vars on the `apps/orto` Vercel project, inlined into the client
bundle at build time:

| Env var                      | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`       | Web tab title, sign-in page, landing hero                              |
| `NEXT_PUBLIC_APP_SHORT_NAME` | Short label for the sidebar header                                     |
| `NEXT_PUBLIC_APP_ICON_URL`   | Custom logo/favicon (absolute URL or a path under `apps/orto/public/`) |

Set these in the Vercel project (see [apps/orto/.env.example](../apps/orto/.env.example)) and
redeploy `apps/orto` so the fresh build picks them up.

---

## Architecture Reference

For details on the infrastructure components, see:

- [terraform/README.md](../terraform/README.md) - Terraform module documentation
- [README.md](../README.md) - System architecture overview
- [OPENAI_MODELS.md](OPENAI_MODELS.md) - Configuring OpenAI Codex models
