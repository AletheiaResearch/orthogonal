# Modal-only sandbox migration changelog

Human-readable log of the migration that removed Daytona and Vercel Sandbox support and made Modal
the sole sandbox backend.

## Commit reference

Find the migration commit on your branch:

```bash
git log --oneline --grep='standardize to modal'
```

| Field   | Value                                                                |
| ------- | -------------------------------------------------------------------- |
| Subject | `refactor(sandbox): standardize to modal for sandbox infrastructure` |
| Date    | 2026-06-12                                                           |
| Scale   | 76 files changed, ~193 insertions, ~6,570 deletions                  |

**Reference commit (pre-squash PR branch):** `e0931d3591a9c7752226b1c29ba05f9a7d7b3068` (`e0931d3`).
This hash may not exist on `main` after a squash merge — use the `git log` command above instead.

## Summary

- **Removed:** Daytona and Vercel Sandbox as deploy-time options.
- **Required:** Modal for all session sandboxes, filesystem snapshots, and repo image builds.
- **No D1 migration:** The `repo_images.provider` column still accepts arbitrary strings; historical
  rows with `provider = 'vercel'` may remain but are unused.
- **Kept:** The `SandboxProvider` interface, capability-driven lifecycle manager, and
  provider-agnostic `sandbox-runtime` package.

## Before / after selection model

### Before

```
terraform.tfvars  sandbox_provider = "modal" | "daytona" | "vercel"
        │
        ▼
workers-control-plane.tf  SANDBOX_PROVIDER binding
        │
        ▼
SessionDO.createLifecycleManager()  switch on resolveSandboxBackendName()
        │
        ├── modal   → createModalProvider(createModalClient(...))
        ├── daytona → createDaytonaProvider(createDaytonaRestClient(...))
        └── vercel  → createVercelProvider(createVercelSandboxClient(...))
```

Supporting utilities lived in `packages/control-plane/src/sandbox/provider-name.ts`
(`supportsRepoImageBackend`, `resolveSandboxBackendName`). Terraform used
`locals.use_modal_backend`, `use_daytona_backend`, and `use_vercel_backend` to conditionally deploy
infra modules and bind env vars.

### After

```
terraform.tfvars  modal_* credentials always required
        │
        ▼
workers-control-plane.tf  MODAL_* bindings only (no SANDBOX_PROVIDER)
        │
        ▼
SessionDO.createLifecycleManager()  hardcoded createModalProvider(...)
```

See `packages/control-plane/src/session/durable-object.ts` — the factory no longer branches on
`SANDBOX_PROVIDER`.

## Per-layer changes

| Layer             | What changed                                                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Control plane** | Provider factory and `provider-name.ts` removed. `repo-images` routes simplified to Modal-only internal-auth callbacks. `Env` type in `types.ts` dropped `SANDBOX_PROVIDER`, `DAYTONA_*`, and Vercel sandbox bindings. `sandbox/index.ts` exports Modal client and provider only. |
| **Data plane**    | `packages/daytona-infra/` deleted. `packages/modal-infra/` unchanged as the sole backend.                                                                                                                                                                                         |
| **Web**           | `packages/web/src/lib/sandbox-provider.ts` deleted. Repo images UI and API no longer gated by `supportsRepoImages()` — always enabled. `NEXT_PUBLIC_SANDBOX_PROVIDER` removed from Terraform web outputs.                                                                         |
| **Terraform**     | `daytona.tf`, `vercel.tf`, and both infra modules deleted. `modal.tf` deploys unconditionally (no `count`). `variables.tf` drops `sandbox_provider` and all Daytona/Vercel sandbox variables. Modal credential validations always apply.                                          |
| **Docs**          | `docs/VERCEL_SANDBOX_PROVIDER.md` deleted. Daytona/Vercel sandbox setup sections removed from `GETTING_STARTED.md`, `SECRETS.md`, `HOW_IT_WORKS.md`, and related guides.                                                                                                          |
| **Tests**         | Daytona/Vercel provider tests and `provider-name.test.ts` deleted. `repo-images` unit and integration tests rewritten for Modal `INTERNAL_CALLBACK_SECRET` HMAC auth. `manager.test.ts` updated for unified `clearSandboxCodeServer()` on stop.                                   |

## Removed provider behavior (reference for future designers)

| Provider              | Persistence model                                                       | Repo images                                         | Callback auth                                                          | Stop / resume                                                                                        |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Modal** (retained)  | `snapshot_filesystem()` → opaque image ID stored as `snapshot_image_id` | Yes — async build via `modal-infra` + HMAC callback | `INTERNAL_CALLBACK_SECRET` Bearer HMAC                                 | Snapshot on inactivity; restore spawns new sandbox from image                                        |
| **Daytona** (removed) | Stop/resume same sandbox object (`supportsPersistentResume`)            | No                                                  | N/A                                                                    | Explicit stop via REST API; code-server password preserved across resume                             |
| **Vercel** (removed)  | Vercel Sandbox snapshot API                                             | Yes — orchestrated in control-plane Worker          | Per-build random callback tokens hashed in D1 (`consumeCallbackToken`) | Explicit stop; 45-minute timeout cap; bootstrap script installed runtime into Node-centric sandboxes |

### Capability flags (why lifecycle diverged)

| Provider | `supportsSnapshots` | `supportsRestore` | `supportsWarm` | `supportsPersistentResume` | `supportsExplicitStop` |
| -------- | ------------------- | ----------------- | -------------- | -------------------------- | ---------------------- |
| Modal    | yes                 | yes               | yes            | no                         | no                     |
| Daytona  | no                  | no                | no             | yes                        | yes                    |
| Vercel   | yes                 | yes               | yes            | no                         | yes                    |

The lifecycle manager in `packages/control-plane/src/sandbox/lifecycle/` uses these flags to choose
spawn vs restore vs resume without provider-specific `if` chains in the orchestrator. Tests in
`decisions.test.ts` still reference Daytona-style `providerObjectId` values for the resume path.

## Notable code simplifications

### `repo-images.ts` route (~1,054 → ~540 lines)

Removed Vercel-specific paths:

- Inline sandbox spawn/snapshot/stop for repo image builds
- Per-build callback token generation and `consumeCallbackToken` verification
- `bindProviderSession` for correlating provider session IDs with builds

Modal path retained: trigger build via `ModalClient.buildRepoImage()`, completion via
`/repo-images/build-complete` and `/repo-images/build-failed` with internal HMAC auth.

### `repo-images.ts` D1 store

Removed:

- `bindProviderSession()`
- `consumeCallbackToken()`
- Callback token fields on `registerBuild` INSERT

`RepoImageProvider` type narrowed to `"modal"` only.

### `manager.ts` lifecycle

Removed Daytona-specific preview URL clearing that preserved `code_server_password` on
provider-managed stop. `clearSandboxAccessState()` now always calls `clearSandboxCodeServer()`.

## What was intentionally not changed

- Vercel **web app** deployment (`web_platform`, `web-vercel.tf`, `vercel_api_token`)
- `SandboxProvider` interface and lifecycle decision engine
- `packages/sandbox-runtime/` bridge, entrypoint, and control-plane WebSocket protocol
- D1 schema for `repo_images` (no migration)
