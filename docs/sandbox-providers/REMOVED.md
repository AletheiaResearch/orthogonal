# Removed sandbox provider inventory

Everything deleted or de-wired in the Modal-only migration. Find the commit with
`git log --oneline --grep='standardize to modal'`, then use `git show <migration-commit>^:<path>` to
recover file contents from the parent commit.

## Deleted packages and directories

### `packages/daytona-infra/`

Python tooling for seeding Daytona base snapshots (bootstrap, toolchain, config).

| Path                                      | Role                                 |
| ----------------------------------------- | ------------------------------------ |
| `packages/daytona-infra/README.md`        | Setup notes                          |
| `packages/daytona-infra/src/bootstrap.py` | Snapshot seeding entrypoint          |
| `packages/daytona-infra/src/config.py`    | Daytona config                       |
| `packages/daytona-infra/src/toolchain.py` | Toolchain install for snapshot image |

### Control plane — Daytona

| Path                                                                    | Role                             |
| ----------------------------------------------------------------------- | -------------------------------- |
| `packages/control-plane/src/sandbox/daytona-rest-client.ts`             | REST client for Daytona API      |
| `packages/control-plane/src/sandbox/daytona-rest-client.test.ts`        | Client tests                     |
| `packages/control-plane/src/sandbox/providers/daytona-provider.ts`      | `SandboxProvider` implementation |
| `packages/control-plane/src/sandbox/providers/daytona-provider.test.ts` | Provider tests                   |

### Control plane — Vercel Sandbox

| Path                                                                        | Role                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/control-plane/src/sandbox/providers/vercel/provider.ts`           | `SandboxProvider` implementation                  |
| `packages/control-plane/src/sandbox/providers/vercel/provider.test.ts`      | Provider tests                                    |
| `packages/control-plane/src/sandbox/providers/vercel/client.ts`             | Vercel Sandbox REST client                        |
| `packages/control-plane/src/sandbox/providers/vercel/client.test.ts`        | Client tests                                      |
| `packages/control-plane/src/sandbox/providers/vercel/bootstrap.ts`          | Runtime install script for Node-centric sandboxes |
| `packages/control-plane/src/sandbox/providers/vercel/base-snapshot.ts`      | Base snapshot helpers                             |
| `packages/control-plane/src/sandbox/providers/vercel/base-snapshot.test.ts` | Base snapshot tests                               |
| `packages/control-plane/scripts/build-vercel-base-snapshot.ts`              | CLI to build Vercel base snapshot                 |
| `packages/control-plane/vite.vercel-base-snapshot.config.ts`                | Vite config for snapshot build script             |

### Control plane — shared selection

| Path                                                       | Role                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `packages/control-plane/src/sandbox/provider-name.ts`      | `resolveSandboxBackendName`, `supportsRepoImageBackend` |
| `packages/control-plane/src/sandbox/provider-name.test.ts` | Selection helper tests                                  |

### Web

| Path                                            | Role                                                           |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `packages/web/src/lib/sandbox-provider.ts`      | `supportsRepoImages()` — gated images UI for Modal/Vercel only |
| `packages/web/src/lib/sandbox-provider.test.ts` | Tests                                                          |

### Terraform modules

| Path                                                                    | Role                                   |
| ----------------------------------------------------------------------- | -------------------------------------- |
| `terraform/modules/daytona-infra/main.tf`                               | Daytona snapshot build `null_resource` |
| `terraform/modules/daytona-infra/outputs.tf`                            | Module outputs                         |
| `terraform/modules/daytona-infra/variables.tf`                          | Module variables                       |
| `terraform/modules/daytona-infra/scripts/build-snapshot.sh`             | Snapshot build script                  |
| `terraform/modules/vercel-sandbox-infra/main.tf`                        | Vercel base snapshot build             |
| `terraform/modules/vercel-sandbox-infra/outputs.tf`                     | `snapshot_name` output                 |
| `terraform/modules/vercel-sandbox-infra/variables.tf`                   | Module variables                       |
| `terraform/modules/vercel-sandbox-infra/scripts/build-base-snapshot.sh` | Base snapshot script                   |

### Terraform environment files

| Path                                           | Role                                      |
| ---------------------------------------------- | ----------------------------------------- |
| `terraform/environments/production/daytona.tf` | Conditional `module.daytona_infra`        |
| `terraform/environments/production/vercel.tf`  | Conditional `module.vercel_sandbox_infra` |

### Documentation

| Path                              | Role                                  |
| --------------------------------- | ------------------------------------- |
| `docs/VERCEL_SANDBOX_PROVIDER.md` | Full Vercel Sandbox operational guide |

## Deleted Terraform variables

From `terraform/environments/production/variables.tf` and `terraform.tfvars.example`:

| Variable                        | Used when                                               |
| ------------------------------- | ------------------------------------------------------- |
| `sandbox_provider`              | Always — selected `"modal"`, `"daytona"`, or `"vercel"` |
| `daytona_api_url`               | `sandbox_provider = "daytona"`                          |
| `daytona_api_key`               | `sandbox_provider = "daytona"`                          |
| `daytona_base_snapshot`         | `sandbox_provider = "daytona"`                          |
| `daytona_target`                | Optional Daytona target                                 |
| `vercel_sandbox_token`          | `sandbox_provider = "vercel"`                           |
| `vercel_sandbox_project_id`     | `sandbox_provider = "vercel"`                           |
| `vercel_sandbox_team_id`        | Optional Vercel team                                    |
| `vercel_sandbox_api_base_url`   | Override for tests / non-default API base               |
| `vercel_sandbox_runtime`        | Vercel sandbox runtime (default `node24`)               |
| `vercel_base_snapshot_id`       | Prebuilt base snapshot ID                               |
| `vercel_base_snapshot_name`     | Managed base snapshot sandbox name                      |
| `vercel_snapshot_expiration_ms` | Snapshot TTL (`0` = no expiration)                      |

**Not deleted** (web hosting, unrelated to sandbox execution):

- `vercel_api_token`, `vercel_team_id`, `web_platform`, and `terraform/modules/vercel-project/`

## Deleted Terraform locals

From `terraform/environments/production/locals.tf`:

- `use_modal_backend`
- `use_daytona_backend`
- `use_vercel_backend`

## Deleted Worker env bindings

From `packages/control-plane/src/types.ts` (`Env` interface):

| Binding                                 | Purpose                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `SANDBOX_PROVIDER`                      | `"modal"` / `"daytona"` / `"vercel"`                      |
| `DAYTONA_API_URL`                       | Daytona REST base URL                                     |
| `DAYTONA_API_KEY`                       | Bearer token + HMAC for code-server password              |
| `DAYTONA_BASE_SNAPSHOT`                 | Named snapshot for fresh sandboxes                        |
| `DAYTONA_AUTO_STOP_INTERVAL_MINUTES`    | Idle stop interval                                        |
| `DAYTONA_AUTO_ARCHIVE_INTERVAL_MINUTES` | Archive interval                                          |
| `DAYTONA_TARGET`                        | Optional Daytona target                                   |
| `VERCEL_TOKEN`                          | Vercel Sandbox API (sandbox scope — not web deploy token) |
| `VERCEL_PROJECT_ID`                     | Sandbox API project scope                                 |
| `VERCEL_TEAM_ID`                        | Optional team                                             |
| `VERCEL_BASE_SNAPSHOT_ID`               | Prebuilt runtime snapshot                                 |
| `VERCEL_BASE_SNAPSHOT_NAME`             | Managed snapshot name                                     |
| `VERCEL_RUNTIME`                        | Sandbox runtime flavor                                    |
| `VERCEL_SANDBOX_API_BASE_URL`           | API base override                                         |
| `VERCEL_SNAPSHOT_EXPIRATION_MS`         | Snapshot expiration                                       |

**Retained Modal bindings:** `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `MODAL_API_SECRET`,
`MODAL_WORKSPACE`, `MODAL_ENVIRONMENT`, `MODAL_ENVIRONMENT_WEB_SUFFIX`.

## Deleted web env

| Binding                        | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `NEXT_PUBLIC_SANDBOX_PROVIDER` | Client-side repo images feature gate |

Removed from `terraform/environments/production/web-cloudflare.tf` and `web-vercel.tf`.

## Deleted Terraform outputs

From `terraform/environments/production/outputs.tf`:

| Output                      | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `sandbox_provider`          | Echo of `var.sandbox_provider`          |
| `vercel_base_snapshot_id`   | Configured Vercel base snapshot         |
| `vercel_base_snapshot_name` | Managed snapshot name from infra module |

`verification_commands` output simplified to always curl Modal health URL.

## Removed D1 / store helpers

From `packages/control-plane/src/db/repo-images.ts` (no schema migration):

| Removed                                         | Purpose                                          |
| ----------------------------------------------- | ------------------------------------------------ |
| `bindProviderSession()`                         | Link Vercel provider session ID to a build row   |
| `consumeCallbackToken()`                        | Single-use per-build callback token verification |
| Callback token fields on `registerBuild` INSERT | Vercel async build auth                          |

## Removed package.json script

From `packages/control-plane/package.json`:

- `build:vercel-base-snapshot`

## Minor docstring / comment updates (not deletions)

- `packages/sandbox-runtime/` — module doc narrowed to Modal (runtime code unchanged)
- `packages/shared/src/types/integrations.ts` — removed multi-provider sandbox references
