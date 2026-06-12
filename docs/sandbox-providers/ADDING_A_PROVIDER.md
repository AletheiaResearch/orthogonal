# Adding a sandbox provider

Checklist for introducing a second sandbox backend after the Modal-only migration. Read
[CHANGELOG.md](./CHANGELOG.md) and [REMOVED.md](./REMOVED.md) first to see what was deleted and why.

> SCM providers (GitHub, Bitbucket) use a separate checklist:
> `docs/provider-contribution-checklist.md`

## 1. Choose an integration pattern

| Pattern                                   | Example | Data plane                                                   | Repo images                                          |
| ----------------------------------------- | ------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| **HTTP shim**                             | Modal   | Separate package (`modal-infra`) + HMAC REST API from Worker | Delegated to shim                                    |
| **Direct REST**                           | Daytona | Worker calls provider API directly                           | Not supported                                        |
| **Direct REST + in-Worker orchestration** | Vercel  | Worker calls provider API; builds run in control plane       | In-Worker spawn/snapshot + per-build callback tokens |

Pick one before writing code. A Cloudflare Sandbox SDK integration would likely be **in-Worker**
(like Vercel) or **Sandbox DO binding** (new pattern — no deleted reference implementation).

## 2. Implement `SandboxProvider`

- [ ] Add `packages/control-plane/src/sandbox/providers/<name>-provider.ts`
- [ ] Implement required methods: at minimum `createSandbox`
- [ ] Set `capabilities` correctly — lifecycle behavior depends on this (see
      [ARCHITECTURE.md](./ARCHITECTURE.md))
- [ ] Map provider errors to `SandboxProviderError` with `transient` vs `permanent` for circuit
      breaker
- [ ] Use `buildSessionConfig()` from `sandbox-env.ts` for env assembly — do not hand-roll
      `SESSION_CONFIG`
- [ ] Add co-located `*.test.ts` with mocked client

### Capability checklist

| If your provider…                           | Set                              |
| ------------------------------------------- | -------------------------------- |
| Snapshots filesystem on inactivity          | `supportsSnapshots: true`        |
| Can boot from a saved snapshot/image ID     | `supportsRestore: true`          |
| Supports pre-warm / early spawn benefit     | `supportsWarm: true`             |
| Resumes the same stopped object in place    | `supportsPersistentResume: true` |
| Has an explicit stop API (not just timeout) | `supportsExplicitStop: true`     |

## 3. Wire the factory

Restore deploy-time selection (removed in the Modal-only migration):

- [ ] Add selection helper (was `provider-name.ts`): `resolveSandboxBackendName()`, feature gates
      like `supportsRepoImageBackend()`
- [ ] Add `SANDBOX_PROVIDER` to `packages/control-plane/src/types.ts` `Env`
- [ ] Replace hardcoded `createModalProvider()` in `SessionDO.createLifecycleManager()` with a
      switch
- [ ] Validate provider-specific env vars at factory time (fail fast with clear errors)
- [ ] Export new provider from `packages/control-plane/src/sandbox/index.ts` if needed

Reference the pre-migration factory:

```bash
git log --oneline --grep='standardize to modal'
git show <migration-commit>^:packages/control-plane/src/session/durable-object.ts
```

## 4. Data plane / bootstrap

- [ ] **Modal pattern:** new package under `packages/<name>-infra/` + Terraform `null_resource`
      deploy
- [ ] **Daytona pattern:** Terraform module builds base snapshot; REST from Worker only
- [ ] **Vercel pattern:** bootstrap script installs `sandbox-runtime` into provider base image

Regardless of pattern:

- [ ] `packages/sandbox-runtime` entrypoint must run as PID 1 (OpenCode + bridge + git sync)
- [ ] Bridge connects to `{control_plane_url}/sessions/{session_id}/ws?type=sandbox`
- [ ] Preview URLs for code-server / ttyd / tunnel ports must reach the control plane and session UI
- [ ] LLM API keys: Modal injects via Modal Secrets; Daytona required global `ANTHROPIC_API_KEY`;
      plan secret injection for new provider

## 5. Repo images (optional)

Skip initially if the provider lacks a snapshot/image model. Gate web UI if needed (see section 7).

If supported:

- [ ] `repo_images.provider` column accepts new string values — no D1 migration required
- [ ] Choose callback auth model:
  - **Modal:** shared `INTERNAL_CALLBACK_SECRET` HMAC on `/repo-images/build-complete` and
    `/repo-images/build-failed`
  - **Vercel (removed):** per-build random tokens in D1 — required restoring
    `consumeCallbackToken()` and `bindProviderSession()`
- [ ] Extend `packages/control-plane/src/routes/repo-images.ts` (currently Modal-only)
- [ ] Extend `packages/control-plane/src/db/repo-images.ts` `RepoImageProvider` type
- [ ] Add provider-specific build worker or in-Worker orchestration
- [ ] Update `docs/IMAGE_PREBUILD.md`

## 6. Terraform

- [ ] Add `sandbox_provider` variable: `"modal" | "<new>"` (default `"modal"`)
- [ ] Restore `locals.use_*_backend` in `locals.tf` if modules are conditional
- [ ] Add `terraform/modules/<name>-infra/` if base snapshot/image pipeline is needed
- [ ] Add `terraform/environments/production/<name>.tf` for conditional module wiring
- [ ] Bind provider env vars in `workers-control-plane.tf`
- [ ] Add provider-specific outputs and verification commands
- [ ] Document new variables in `terraform.tfvars.example` and `terraform/README.md`
- [ ] Keep Modal module unconditional **or** make both conditional — pick one ops model

**Do not confuse** Vercel sandbox variables (`vercel_sandbox_*`, removed) with Vercel web hosting
(`vercel_api_token`, `web_platform`).

## 7. Web app (if feature-gated)

Only needed when the new provider lacks repo images:

- [ ] Restore `packages/web/src/lib/sandbox-provider.ts` with `supportsRepoImages()`
- [ ] Gate `packages/web/src/app/api/repo-images/*` routes
- [ ] Gate settings nav / images settings components
- [ ] Add `NEXT_PUBLIC_SANDBOX_PROVIDER` to web Terraform outputs if client-side gating is required

After migration, repo images UI is always on — no gating exists today.

## 8. Tests

- [ ] Provider unit tests (`providers/<name>-provider.test.ts`)
- [ ] Client tests if using REST shim
- [ ] Lifecycle decision tests for your capability matrix
- [ ] Integration tests in `packages/control-plane/test/integration/repo-images.test.ts` for
      callback auth path
- [ ] `db/repo-images.test.ts` for store methods if callback tokens return

## 9. Documentation

- [ ] Provider-specific guide (like deleted `docs/VERCEL_SANDBOX_PROVIDER.md`)
- [ ] Update `docs/GETTING_STARTED.md` prerequisites table
- [ ] Update `docs/SECRETS.md` for new env vars
- [ ] Update `docs/HOW_IT_WORKS.md` data plane section
- [ ] Update `docs/DEBUGGING_PLAYBOOK.md` with provider debug steps
- [ ] Update `packages/control-plane/README.md`
- [ ] Add entry to [CHANGELOG.md](./CHANGELOG.md) when shipped

## 10. Generalize Modal-specific names (recommended before second provider ships)

- [ ] Rename `modal_object_id` → `provider_object_id` (DB migration or alias)
- [ ] Rename `updateSandboxModalObjectId` repository methods
- [ ] Abstract `buildModalSandboxDashboardUrl` or add provider-specific dashboard helpers

## Architecture review checklist

- [ ] No provider-specific URL/token logic in router, session handlers, or slack-bot layers
- [ ] Lifecycle manager has no `if (provider === ...)` branches — only capability flags
- [ ] `sandbox-runtime` remains free of provider imports
- [ ] Correlation IDs flow through create/restore/snapshot calls for debugging

## Estimated scope (order of magnitude)

Based on the Modal-only migration removal (~6.4k lines across three providers):

| Scope                                                               | Rough effort      |
| ------------------------------------------------------------------- | ----------------- |
| Provider + factory + Terraform + tests (no repo images)             | ~800–1,500 LOC    |
| Full repo image parity                                              | +500–1,000 LOC    |
| Restore full multi-provider framework (selection, web gating, docs) | +400 LOC plumbing |

Start with session spawn/restore/snapshot without repo images; add prebuilds once the core path is
stable.
