# Terminus — LLM Gateway (CON-41) — design + tracking

**Status:** In Progress · **Branch:** `worktree-con-41-llm-gateway` → push to
`nejc/con-41-llm-gateway-model-routing-chatgptcodex-oauth-vercel-ai-sdk` **Issue:**
[CON-41](https://linear.app/refrakts/issue/CON-41) · **Date:** 2026-06-16

Terminus is a stateless Cloudflare Worker that fronts all LLM traffic: it verifies a short-lived
signed token, resolves the upstream provider credential server-side, serves a dynamic model catalog,
and proxies chat completions through the Vercel AI SDK. Sandboxes hold only a scoped token, never
raw provider keys. LiteLLM is the conceptual reference; the build is on the Vercel AI SDK.

## Locked decisions

- **D-gateway = build it.** CON-41 being live is the go-ahead (the design doc had it as an undecided
  fork). This is "Phase G".
- **Scope of this PR = the foundation spine:** CON-48 (proxy), CON-52 (token verify), CON-49
  (`/v1/models`), CON-51 (credential resolution). Deferred: CON-50 (Codex OAuth), CON-53
  (control-plane minting + OpenCode plugin), CON-54 (metering ledger).
- **Location/name:** `services/terminus`, package `@orthogonal/terminus`.
- **Wire surface = AI SDK termination.** Terminus exposes OpenAI-compatible `/v1/chat/completions`;
  internally uses the Vercel AI SDK to call heterogeneous upstreams and streams OpenAI-compat SSE
  back.
- **Catalog + providers are dynamic (OpenRouter-style).** `/v1/models` = the models.dev registry
  narrowed to providers that have a configured credential. Adding a provider = drop in a key; no
  code change. Code only gets involved for **override** providers that need special handling.

## Deferred — logged to Linear

- **Dashboard/D1 key store (per CON-51):** for now provider keys are Worker secrets (a new provider
  needs a Terraform secret). The resolver is an interface so a D1/KV-backed store
  (dashboard-inserted keys, BYOK, per-tenant) swaps in with no call-site changes. → comment on
  CON-51.
- **Per-tenant `allowed_models` tightening (per CON-52):** for now the token's `allowed_models`
  defaults to "all enabled models"; per-tenant scoping comes with multi-tenancy. → comment on
  CON-52.

## Architecture

### Provider adapter table ("dynamic unless overridden")

| Provider                              | Handling                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| _(default — any models.dev provider)_ | `@ai-sdk/openai-compatible` with `baseURL` from the models.dev entry + configured key. Add a key → models light up. |
| `anthropic`                           | override → `@ai-sdk/anthropic` (native Messages API)                                                                |
| `openai`                              | override → `@ai-sdk/openai`                                                                                         |
| `openai` + Codex OAuth                | override → `chatgpt backend-api/responses` + `ChatGPT-Account-Id` (CON-50, later)                                   |

OpenRouter / OpenCode-Zen / Groq / etc. are just default-path providers enabled by key presence.

### Components (each one unit, one purpose)

- `src/app.ts` — Hono app: routes, error shape, health.
- `src/middleware/auth.ts` — verify gateway token → claims on context.
- shared `gateway-token.ts` (`@open-inspect/shared`) — claims type +
  `mintGatewayToken`/`verifyGatewayToken` (HS256) so control-plane mints and Terminus verifies from
  one source.
- `src/catalog/` — fetch models.dev `api.json` → cache (KV + bundled fallback) → narrow to enabled
  providers (∩ token `allowed_models`).
- `src/credentials/resolver.ts` — `CredentialResolver` interface + `EnvKeyResolver` (Worker
  secrets). D1/KV/BYOK later.
- `src/providers/router.ts` — `(provider, model, credential)` → AI SDK model (override adapter or
  default openai-compatible from the registry baseURL).
- `src/routes/chat.ts` — OpenAI-compat request → `streamText` → OpenAI-compat SSE; emit usage.
- `src/usage/sink.ts` — `UsageSink` interface + logging no-op (CON-54 fills it; session-level via
  `sid`).

### Request flow

```
OpenCode ── POST /v1/chat/completions (Bearer <token>, OpenAI body, stream) ──▶ Terminus
  1. verify token (sig + exp)                                  → 401
  2. parse model → {provider, model}; ∈ allowed_models         → 403
  3. resolve credential (provider enabled?)                    → 402/502
  4. AI SDK streamText({ model, messages }) ──▶ upstream
  5. map AI SDK stream → OpenAI chat.completion.chunk SSE ──▶ OpenCode
  6. finish → usage{input,output,reasoning} → UsageSink (sid, session-level)
```

### Token model (CON-52)

HS256, shared secret `TERMINUS_JWT_SECRET`, short TTL (~15 min), stateless verify (sig + exp only).
Claims: `{ sid, tenant: null, allowed_models: string[], iat, exp }`. `tenant` nullable now; the
shape does not change when multi-tenancy lands.

## Unknowns — all resolved during the build

1. **OpenCode emit shape** — exact request + stream-chunk shape OpenCode's
   `@ai-sdk/openai-compatible` custom provider emits to the gateway baseURL (pinned OpenCode
   version).
2. **models.dev `api.json`** — actual schema (provider `id`, `api` baseURL, `models`, pricing) +
   availability fallback.
3. **Vercel AI SDK on Workers** — `ai` / `@ai-sdk/*` versions, `nodejs_compat`, streaming; honor the
   7-day publish-age gate when pinning.
4. **`@ai-sdk/openai-compatible` baseURL wiring** — confirm dynamic
   `createOpenAICompatible({baseURL})` path behaves as assumed.

## Checklist (living tracker)

- [x] Verify the unknowns — models.dev schema (workflow + inline), AI SDK stable versions within the
      7-day gate, openai-compatible POSTs `{baseURL}/chat/completions`, `streamText().fullStream`
      part shapes (read from installed `.d.ts`)
- [x] Scaffold `services/terminus` (package.json, tsconfig, vite, wrangler.toml, oxlint) matching
      the bots — installs/typechecks/builds green
- [x] Add `services/terminus` to `pnpm-workspace.yaml`; add AI SDK to the catalog (`ai@6.0.199`,
      `@ai-sdk/openai@3.0.69`, `@ai-sdk/anthropic@3.0.82`, `@ai-sdk/openai-compatible@2.0.48`)
- [x] shared: `gateway-token.ts` (mint/verify) + export + build — 11 tests green ✅ committed
- [x] credential resolver interface + env-key impl, registry-env aware (CON-51) — 11 tests ✅
      committed
- [x] registry parse + `resolveModelRef` (CON-49) — tested ✅ committed
- [x] catalog `buildModelsList` + models.dev fetch/cache (CON-49) — tested ✅ committed
- [x] provider router: openai-compatible default + anthropic/openai overrides (CON-48) — tested ✅
      committed
- [x] auth middleware + token verify (CON-52) — tested ✅ committed
- [x] **CON-54 (scoped)** — `UsageSink` seam + **gateway-priced cost** (`costUsd` from models.dev)
      on every emitted record; logging sink is the emission boundary. **Durable store intentionally
      deferred** (Nejc: a timeseries metrics DB is chosen later) — 5 pricing tests + e2e cost
      assertion ✅ committed
- [x] app wiring: `/health`, `/v1/models` (auth + dynamic catalog), chat route — tested ✅ committed
- [x] **chat proxy: streamText → OpenAI-compat SSE + non-stream (CON-48)** —
      `openai/{protocol,messages}` + `routes/chat.ts`; ChatML↔ModelMessage,
      tools/tool-calls/tool-results, streaming SSE + JSON, usage emit — tested ✅ committed
- [x] Terraform worker module instance + secrets + KV (`enable_terminus`, gated off by default) + CI
      `ts` filter
- [x] build/typecheck/lint/test green — typecheck clean, **72 tests** pass (incl. proxy happy-path:
      non-stream + streaming SSE end-to-end via `MockLanguageModelV3`; + cost pricing), build 273 kB
      gzip
- [x] Linear: comments on CON-51 + CON-52 for deferred items

## Status — foundation spine complete

CON-48 (proxy), CON-49 (`/v1/models`), CON-51 (credential resolution), CON-52 (token auth) are
implemented, tested (65 tests), and committed on `worktree-con-41-llm-gateway`. Deferred per scope:
CON-50 (Codex OAuth), CON-53 (control-plane minting + OpenCode plugin), CON-54 (durable metering).

**Follow-ups noted in code/Linear:** D1/KV dashboard key store (CON-51 comment); per-tenant
`allowed_models` (CON-52 comment); incremental tool-arg streaming + SSE error frames; `opencode/*`
upstream wiring; wire `services/terminus/**` into `coverage.yml`.

Not yet pushed — awaiting the go-ahead to open the PR (then move CON-41 to In Review).

---

## CON-50 — Codex/ChatGPT OAuth brokering (server-side) — plan

**Goal:** Terminus serves Codex (ChatGPT Pro/Plus) models without sandboxes ever holding Codex
creds. Sandboxes hold only the gateway JWT (`sid`); Terminus mints the upstream request server-side.

### Determinations (verified, not forks)

1. **Token source = control-plane is sole refresher; Terminus receives access tokens only.** The
   refresh service rotates and writes back the single-use `refresh_token` on every refresh
   (`openai-token-refresh-service.ts:125`) and already handles concurrent rotation. A second
   refresher would clobber the refresh token → 401 storms. So Terminus must NOT hold the refresh
   token. It calls the existing `/sessions/:id/openai-token-refresh` handler
   (`sandbox.handler.ts:170`), which already returns exactly
   `{access_token, expires_in, account_id}`. Transport = a Cloudflare **service binding**
   `CONTROL_PLANE` (same pattern as `workers-github.tf:34`), gated by `enable_service_bindings`.
   Terminus pulls per-request, caches the access token in-isolate keyed by `sid` until `expires_in`
   minus a buffer.

2. **Router builds Codex via the AI SDK Responses API — no bespoke adapter.** Verified from the
   compiled `@ai-sdk/openai@3.0.69`: `createOpenAI({ apiKey, baseURL, headers, fetch })` sets
   `Authorization: Bearer <apiKey>` then spreads `...options.headers` (so account-id rides in
   headers); `.responses(modelId)` POSTs `{baseURL}/responses`. So
   `createOpenAI({ apiKey: access, baseURL: "https://chatgpt.com/backend-api/codex", headers: { "ChatGPT-Account-Id": accountId, originator: "opencode", session_id: sid } }).responses(modelId)`
   hits exactly `chatgpt.com/backend-api/codex/responses` — replicate the working plugin headers
   exactly (`codex-auth-plugin.js:13,209,231`): `ChatGPT-Account-Id`, `originator:"opencode"`,
   `session_id`. Do NOT invent a new `originator` string — a wrong value is a plausible 400 cause.

### Identification + enablement seam (the 5-file codex spine)

`resolveModelRef` only knows models.dev providers (no chatgpt-backend entry), so without new wiring
the router can never produce a codex ref. Concrete spine:

1. `catalog/registry.ts` — inject synthetic codex models (source = plugin `ALLOWED_MODELS`,
   `codex-auth-plugin.js:17-27`) under a `codex/*` provider id; add `credentialMode:"codex-oauth"` +
   `responsesApi:true` + chatgpt baseURL to `ResolvedModelRef`.
2. `catalog/catalog.ts` (`/v1/models`) — advertise codex models (see fork below).
3. `credentials/resolver.ts` — a codex credential branch keyed by `sid` (calls control-plane), NOT
   `EnvKeyResolver` (reads worker `env`).
4. `providers/router.ts` — branch `buildLanguageModel` on `credentialMode==="codex-oauth"`, not
   `npm`.
5. `routes/chat.ts` — route the codex credential path + thread `sid`.

**Fork — codex enablement is per-session (D1 repo secret), not a worker secret**, so
`EnvKeyResolver.isEnabled` structurally cannot answer "is codex available." Default:
**advertise-always in `/v1/models`, fail-at-call-time (502)** — matches the
empty-`allowed_models`=all posture, avoids a per-catalog round-trip to control-plane.

3. **Login flow already exists; CON-50 reuses it.** The human logs in locally via OpenCode
   (`/connect setup` → browser OAuth, loopback) and pastes `refresh` + `accountId` into repo secrets
   (`docs/OPENAI_MODELS.md:28-56`). A Cloud Worker cannot bind the `localhost:1455` loopback
   redirect the OAuth client requires, so no dashboard OAuth callback is built now. Optional later:
   a device-code flow in the control-plane (reference `openai-auth.ts:97-144`).

### Headline uncertainty (spike first)

The **request body** the AI SDK responses model emits may not satisfy `backend-api/codex/responses`
(needs `store:false`, `originator` header, reasoning/instructions quirks). Capture the outgoing
request via `createOpenAI({fetch})` and diff against a known-good request from the working sandbox
plugin path before wiring upstream.

## CON-50 — REVISED: Terminus credential vault (supersedes determination #1)

> Through design review (Nejc, 2026-06-17) CON-50 grew from "broker Codex tokens from control-plane"
> into **Terminus owns its credentials end-to-end** — the self-contained,
> OpenRouter/LiteLLM/Helicone-shaped gateway it was always meant to be. The original "control-plane
> is the sole refresher" determination (#1 below) was over-broad: the real invariant is **one
> refresher per refresh token**. Terminus owning its _own_ ChatGPT account (distinct from the legacy
> per-repo sandbox creds) satisfies that cleanly. The control-plane refresh path stays for the
> legacy raw-key sandbox flow — additive, on distinct tokens, no conflict.

### Locked decisions (Nejc, 2026-06-17)

- **Terminus owns all provider credentials** in its **own D1** database (not a DO; not
  control-plane). _D1 over DO_ because: the credential+routing model is relational (Helicone-style);
  the codebase already does encrypted secrets **and** single-use OAuth rotation on D1
  (`repo-secrets.ts`, `openai-token-refresh-service.ts`); and the scheduled-refresh model makes the
  request path **read-only**, so the DO's rotation-serialization isn't needed (a D1 conditional
  update guards the rare race).
- **Encryption at rest = AES-256-GCM**, key from a Worker secret (`CREDENTIALS_ENCRYPTION_KEY`).
  Lift control-plane's `auth/crypto.ts` into `@open-inspect/shared` so both workers encrypt/decrypt
  identically; extend it with an optional **AAD = owner id** (Helicone binds ciphertext to `org_id`
  so a row can't be decrypted under another owner). Decrypt **only in-isolate**; **never** KV.
- **Unified credential entity** (Helicone `provider_keys`): platform and BYOK are the **same row**,
  distinguished by `owner`; routing/authorization — not table identity — gates who uses which key.
  CON-50 ships `owner = platform` only (the gateway token's `tenant` is `null` today).
- **Codex = a credential row** whose encrypted secret holds the 4 OAuth components (`refresh`,
  `access`, `account_id`, `expires_at`). Terminus is the **sole refresher for its own account**
  (ports control-plane's `refreshOpenAIToken` — a plain HTTPS POST; no loopback needed).
- **Refresh = cron `scheduled()`** handler (refreshes near-expiry, ~10 min buffer) **+ lazy
  refresh-on-read fallback** for the post-seed window. Concurrent rotation is handled by porting
  control-plane's proven pattern: attempt the OpenAI refresh; on a `401` (the single-use token was
  already rotated by a concurrent writer) re-read the freshly-rotated row from D1 and use it. (The
  refresh token lives _inside_ `secret_encrypted`, so it can't be a SQL `WHERE` predicate; an
  optional optimistic guard is an opaque `secret_encrypted` compare or a `version` column.) Request
  path is read-only.
- **Seeding via Terraform/Worker secret** (the human still logs in locally via OpenCode and pastes
  the Codex refresh token + provider keys into Terraform-managed secrets); the D1 table is the
  runtime source of truth; ingestion via an admin API / Orto BYOK comes later.
- **Scope:** CON-50 migrates **all** provider keys into the vault (per Nejc) + Codex OAuth + cron
  refresh. **Deferred → new CON-41 sub-issues:** (a) BYOK / per-tenant ingestion API + admin panel
  (blocked on multi-tenancy; `tenant` is `null` today), (b) LiteLLM/Helicone-style **LB & routing**
  (multi-key per provider, weights, fallbacks, cooldowns) as a versioned routing-config blob.

### Already built + verified (source-agnostic spine — stands regardless of the source)

`registry.ts` `credentialMode` + synthetic `codex/*` provider (`catalog/codex.ts`); router
`.responses()` Codex branch + the 4 OAuth headers (`ChatGPT-Account-Id`, `originator:"opencode"`,
`session_id`) + `codexProviderOptions` (`store:false`, `include:["reasoning.encrypted_content"]`,
`reasoningSummary:"auto"`, `prompt_cache_key`); and the **request-contract spike** — verified
against `@ai-sdk/openai@3.0.69`, cross-checked vs `openai/codex` (Rust) + OpenCode core. 91 tests.

### Data model — Terminus D1 `provider_credentials`

One unified table (mirrors Helicone's single `provider_keys`):

| Column                      | Meaning                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `id TEXT PK`                | credential id                                                                                 |
| `owner_type TEXT`           | `platform` \| `tenant` (CON-50: `platform` only)                                              |
| `owner_id TEXT`             | tenant id for BYOK; `''`/sentinel for platform. Used as the AES-GCM **AAD**                   |
| `provider TEXT`             | models.dev provider id, or `codex`                                                            |
| `credential_mode`           | `api_key` \| `codex-oauth`                                                                    |
| `secret_encrypted`          | AES-256-GCM base64 — `api_key`: the key; `codex-oauth`: encrypted JSON of the 4 components    |
| `expires_at INT`            | access-token expiry (ms); **plaintext** so the cron finds near-expiry rows without decrypting |
| `enabled INT`               | advertise/serve this credential                                                               |
| `config TEXT`               | provider-specific JSON (baseURL/region overrides) — Helicone `config` analog (nullable)       |
| `created_at/updated_at INT` | epoch ms                                                                                      |

`UNIQUE(owner_type, owner_id, provider)` for now (single key per owner+provider; relaxed when
multi-key LB lands). Routing/LB config + per-key limits are **deferred** (the LB sub-issue).

### Request flow (gateway ON)

```
verify gateway token → resolve credential by (owner=platform, provider) from D1
  → decrypt in-isolate (AAD=owner_id) → buildLanguageModel (codex .responses() branch or provider)
  → streamText/generateText → OpenAI-compat SSE → usage sink
```

In-isolate read-through cache of decrypted creds (ephemeral, per-isolate — not KV). `/v1/models`
advertises the providers/models with an `enabled` credential row (Codex included when seeded).

### Refresh flow (Codex)

```
cron tick → SELECT codex rows WHERE expires_at < now + buffer
  → POST OpenAI token endpoint (ported refreshOpenAIToken) → rotated {refresh, access, expires}
  → UPDATE … WHERE refresh_token = <old>  (conditional; re-read on miss = concurrent rotation)
```

### Open / live-verify

- Separate Terminus D1 (recommended, self-contained) vs sharing control-plane's D1 — **separate**.
- Smoke (real creds): Codex upstream body acceptance; OAuth refresh-endpoint behavior from a Worker.

### Build progress (branch `nejc/con-50-codex-opencode`, base `terminus`)

Committed + pushed, TDD, all green (86 unit + 13 D1-integration tests):

- ✅ **Spine** — `registry.ts` `credentialMode`; synthetic `codex/*` provider (`catalog/codex.ts`);
  router `.responses()` branch + 4 OAuth headers + `codexProviderOptions`; request-contract
  **spike** verified vs `@ai-sdk/openai@3.0.69` + cross-checked vs openai/codex (Rust) + OpenCode
  core.
- ✅ **Shared crypto** — `@open-inspect/shared` `encryptSecret`/`decryptSecret` (AES-256-GCM,
  optional owner-AAD); additive, control-plane crypto untouched.
- ✅ **Vault** — own D1 + Drizzle (`drizzle-orm@0.45.2`/`drizzle-kit@0.31.10`);
  `provider_credentials` schema + generated migration; `CredentialVault` (put/get api-key + Codex,
  list-enabled, owner-scoped upsert); Miniflare-D1 integration harness.
- ✅ **Codex token manager** — `CodexTokenManager` (cached read → rotate via ported
  `refreshCodexToken` → persist rotated single-use token); `refreshIfNearExpiry` (cron path) + lazy
  fallback; 401-reread concurrency.

Remaining for CON-50:

- ⬜ **Vault-backed `CredentialResolver`** — migrate the non-codex providers from `EnvKeyResolver`
  to the vault behind the same interface (in-isolate-cached `listEnabledProviders` for the catalog).
- ⬜ **Wire `chat.ts` / `/v1/models` / `env.ts`** — codex path via `CodexTokenManager` + the router
  branch; non-codex via the vault; `env`: `DB` (D1) + `CREDENTIALS_ENCRYPTION_KEY`.
- ⬜ **Cron `scheduled()`** handler → `CodexTokenManager.refreshIfNearExpiry`.
- ⬜ **Terraform** — Terminus D1 + apply the Drizzle migration + `CREDENTIALS_ENCRYPTION_KEY`
  secret + Codex/provider seed secrets + cron trigger.

## CON-53 — OpenCode wiring — plan

Two halves:

1. **Control-plane mints + injects the gateway token.** In `manager.ts` `doSpawn` (~:394) **and**
   `restoreFromSnapshot` (~:603), when gateway is configured AND the per-session `llmGatewayEnabled`
   toggle is ON, call
   `mintGatewayToken({ sid: session.session_name||id, tenant: null, allowed_models: [] }, TERMINUS_JWT_SECRET, { ttlSeconds })`
   and inject `GATEWAY_TOKEN` + `GATEWAY_BASE_URL` into the sandbox env (thread through
   CreateSandboxConfig/RestoreSandboxConfig → `client.ts` Modal payload → `web_api.py` →
   `manager.py` `env_vars`). When ON, **drop Modal's `llm_secrets`** (`manager.py:412`) so raw keys
   never enter the sandbox — that drop _is_ the security win. Add `TERMINUS_JWT_SECRET` +
   `TERMINUS_GATEWAY_URL` to control-plane `Env` (`types.ts`) + Terraform
   (`workers-control-plane.tf` secret + a `terminus_url` local).
2. **OpenCode config-hook plugin**
   (`packages/sandbox-runtime/src/sandbox_runtime/plugins/gateway-plugin.js`, modeled on
   `codex-auth-plugin.js`): fetch `GET {GATEWAY_BASE_URL}/v1/models` with `Bearer GATEWAY_TOKEN`,
   register ONE custom openai-compatible provider (baseURL→`gateway/v1`, headers→token,
   models←catalog transformed to OpenCode's descriptor shape, **keyed so
   `body.model == provider/model`**), + a fetch interceptor refreshing via a new
   `POST /sessions/:id/gateway-token` near expiry. Copy it in `entrypoint.py:823-830` gated on
   `GATEWAY_TOKEN`.

**Decisions (locked):**

- **Rollout:** default-OFF `llmGatewayEnabled` per-session setting; raw-key injection stays; flip
  default-ON only after a live smoke test.
- **Token:** short TTL (900s) + plugin refresh (a frozen 15-min token would 401 mid-run since
  `EXECUTION_TIMEOUT_MS`=90min and verify has no grace).
- **Delivery:** plugin (superset of inline `OPENCODE_CONFIG_CONTENT`; reuses the proven codex
  `auth.loader` + fetch-interceptor pattern).
- **allowed_models:** `[]` = unrestricted for v1 (matches CON-52 deferral).

**⚠️ Unverified, NOT CI-testable (live smoke test required before flipping ON):** that an OpenCode
config-hook can register a custom `@ai-sdk/openai-compatible` provider whose baseURL points at the
gateway with models from `/v1/models`, on the pinned OpenCode version. The codex precedent only
proves the auth/fetch-interceptor mechanism, NOT `config()`-registers-a-provider. Load-bearing risk.

**Key files:**
`packages/control-plane/src/{types.ts, session/durable-object.ts, sandbox/lifecycle/manager.ts, sandbox/client.ts, sandbox/provider.ts, session/http/handlers/sandbox.handler.ts, routes/session-runtime-proxy.ts, router.ts}`,
`packages/modal-infra/src/{web_api.py, sandbox/manager.py}`,
`packages/sandbox-runtime/src/sandbox_runtime/{entrypoint.py, plugins/gateway-plugin.js}`,
`terraform/environments/production/{workers-control-plane.tf, locals.tf}`.

## Continuation prompt (paste into a fresh session in this worktree)

> Continue Linear issue **CON-41** (Terminus LLM gateway) in this worktree. Read
> `docs/terminus-llm-gateway.md` end-to-end first — it is the design + tracking doc and contains the
> committed CON-50 and CON-53 plans.
>
> **State:** the foundation spine (CON-48 proxy, CON-49 `/v1/models`, CON-51 credential resolution,
> CON-52 token auth) and **CON-54-scoped** (cost-priced usage emission; durable store deferred) are
> done, tested (72 tests), and committed on branch `worktree-con-41-llm-gateway`. **Remaining:
> CON-50 then CON-53** (plans + locked decisions in this doc).
>
> **Workspace/PR rules:** work in this worktree; push with
> `git push origin HEAD:nejc/con-41-llm-gateway-model-routing-chatgptcodex-oauth-vercel-ai-sdk`
> (flows into **PR #12**, base **`terminus`** — an integration branch). **Do NOT merge to `main` and
> do NOT change the PR base.** PR #12 is the whole-epic PR; it merges only when all sub-issues are
> in.
>
> **Repo rules:** build `@open-inspect/shared` first; conventional commits; **sole author Nejc
> Drobnič — never add a Co-Authored-By trailer or any AI-attribution footer to commits or the PR**;
> pnpm catalog is `strict` with a 7-day `minimumReleaseAge` gate (pin versions published ≥7 days
> ago); **TDD** (test first, watch it fail); **verify before claiming done**
> (`pnpm --filter @orthogonal/terminus typecheck && test && build`, `pnpm fmt:check`, `pnpm lint`);
> call the `advisor` before committing to an approach and before declaring done; use **Workflows**
> for parallel research/impl; keep this doc updated (it's shown live via the cmux markdown viewer).
>
> **Linear:** keep sub-issue states current (move to **In Review** + link PR #12 when implemented);
> CON-41 is In Review; **CON-54 stays open** to track the durable timeseries-DB store (deferred per
> Nejc). Comment durable decisions on the relevant issue.
>
> **Locked decisions:** CON-53 ships behind a **default-OFF `llmGatewayEnabled`** toggle (raw-key
> injection stays; flip ON after a live smoke test) with a **short-TTL token + plugin refresh** and
> **plugin** (not inline) delivery; CON-50 reuses **control-plane as the sole token refresher**
> (Terminus pulls access tokens over a `CONTROL_PLANE` service binding — never holds the refresh
> token) and builds Codex via `@ai-sdk/openai` `.responses()` + `ChatGPT-Account-Id` with a
> synthetic `codex/*` provider; CON-54 has **no durable store** (a timeseries metrics DB is chosen
> later).
>
> **Live-verify gaps (implement + unit-test here; flag a deploy-time smoke test):** CON-50's
> upstream body contract at `chatgpt.com/backend-api/codex/responses` (needs real Codex creds);
> CON-53's OpenCode config-hook baseURL repoint (needs a live pinned-OpenCode sandbox).
>
> Suggested order for CON-50: (1) spike the Codex request body via `createOpenAI({ fetch })`; (2)
> terminus identification seam (`codex/*` → `ResolvedModelRef.credentialMode`); (3) router
> Codex-Responses branch; (4) control-plane service-auth on the token-refresh route + a Terminus
> `CodexCredentialResolver` over the service binding; (5) wire `chat.ts`; (6) advertise-always in
> `/v1/models`. TDD each; commit + push as you go.
