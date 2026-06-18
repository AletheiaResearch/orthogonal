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

```text
verify gateway token → resolve credential by (owner=platform, provider) from D1
  → decrypt in-isolate (AAD=owner_id) → buildLanguageModel (codex .responses() branch or provider)
  → streamText/generateText → OpenAI-compat SSE → usage sink
```

In-isolate read-through cache of decrypted creds (ephemeral, per-isolate — not KV). `/v1/models`
advertises the providers/models with an `enabled` credential row (Codex included when seeded).

### Refresh flow (Codex)

```text
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

CON-50 — now complete (committed + pushed):

- ✅ **Vault-backed `CredentialProvider`** — `chat.ts` + `/v1/models` resolve through it; Codex via
  the token manager, other providers from the vault with lazy env-seed; in-isolate-cached
  enablement.
- ✅ **`env.ts`** — `DB` (D1) + `CREDENTIALS_ENCRYPTION_KEY`; cron `scheduled()` →
  `refreshIfNearExpiry`.
- ✅ **Terraform** — separate Terminus D1 + drizzle-migration runner + DB binding + AES key +
  Codex/provider seed secrets + `*/5` cron (gated on `enable_terminus`).

## CON-53 — OpenCode wiring — DONE (behind default-off `llmGatewayEnabled`)

Implemented + tested (1214 control-plane + 12 modal tests; typecheck/fmt green):

- **Control plane** — per-session `llmGatewayEnabled`; `doSpawn`/`restoreFromSnapshot` mint a
  short-TTL gateway token + inject `GATEWAY_TOKEN`/`GATEWAY_BASE_URL` (snake_case to Modal); minting
  is non-fatal. New sandbox-authed `POST /sessions/:id/gateway-token` refresh route.
  `TERMINUS_JWT_SECRET` + `TERMINUS_GATEWAY_URL` added to control-plane Env + terraform.
- **Modal** — threads the gateway vars into both create + restore and **drops `llm_secrets`** when
  the gateway is on (raw keys never enter a gateway-enabled sandbox — the security win).
- **Sandbox-runtime** — `gateway-plugin.js` (config-hook openai-compatible provider + token-refresh
  fetch interceptor) copied by `entrypoint.py` when `GATEWAY_TOKEN` is set.

### ⚠️ Live-verify gaps (NOT CI-testable — required before flipping the toggle ON)

1. **OpenCode config-hook provider registration is UNVERIFIED** on the pinned runtime
   (opencode-ai@1.14.41) — flagged in `gateway-plugin.js` with explicit smoke-test items.
2. **Default-model routing** — _wired_ (corrected 2026-06-17): `entrypoint.py:832-842` re-keys the
   model to `gateway/<provider>/<model>` **when `gateway-plugin.js` is present** in the image. The
   remaining risk is the asymmetry: Modal drops `llm_secrets` based only on `GATEWAY_TOKEN`, so a
   session restored from a **pre-gateway snapshot** (no plugin) gets neither the gateway nor raw
   keys → tracked as **CON-72**. Still UNVERIFIED end-to-end on a real sandbox (the smoke test).
3. **`@ai-sdk/openai-compatible` availability** in the sandbox — may need pre-staging in
   `modal-infra/src/images/base.py` (no runtime npm).
4. **Codex upstream body** at `chatgpt.com/backend-api/codex/responses` — needs real Codex creds.
5. **User-injected LLM keys** — `getUserEnvVars()` still sends user secrets unconditionally; only
   the platform `llm_secrets` are dropped. Gating user-supplied LLM keys is a follow-up.

## CON-53 — OpenCode wiring — original plan

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

## Session 2026-06-17 — post-PR-#13 merge; starting CON-71 + CON-70

**PR #13 is MERGED into `terminus`** (the earlier "not yet pushed / awaiting go-ahead" notes above
are historical). Merged scope: CON-50 (Codex OAuth + credential vault) + CON-53 (OpenCode wiring),
on top of the foundation spine (CON-48/49/51/52/54-scoped) from PR #12. Sub-issue states now: CON-48
/CON-50/CON-53 **Done**; CON-49/CON-51/CON-52 In Review (foundation, merged); CON-54/CON-70/CON-71
/CON-72 open. The only remaining gate for flipping the toggle ON is the **live smoke test** (real
infra/creds) — no codeable remainder in step (1).

**Now in progress (this session):** CON-71 (LiteLLM/Helicone/OpenRouter-style LB + routing) + CON-70
(BYOK/per-tenant rows + ingestion API), together — both evolve the same credential vault. Worktree:
`.claude/worktrees/con-71-con-70-routing-byok` on branch `nejc/con-71-con-70-gateway-routing-byok`
(off `terminus`). Baseline green before changes: 90 unit + 24 D1-integration tests pass.

**Design + scope are locked** — full spec (source of truth) at
[`docs/terminus-routing-byok-design.md`](terminus-routing-byok-design.md). Summary: two persisted
layers — **L1** credential pool (`label`/`priority`/`weight`/`cooldown_until`/ `failure_count`
columns; relax `UNIQUE → (owner_type,owner_id,provider,label)`) and **L2** a Helicone-style
versioned routing policy (`routers` + `router_config_versions`) that does forced default routing **+
RBAC guardrails** (force/clamp params server-side so a leaked gateway JWT can't escape —
terminus-only, platform-default). **Node-graph interpreter deferred** to the dashboard phase (the
CF-AI-Gateway node-builder authors this same policy later). **Phasing:** PR1 = CON-70 + CON-71 L1
(vault columns + platform ingestion/admin API + owner plumbing + per-row selection + non-streaming
fallback + Codex cron-iterate-all); PR2 = CON-71 L2 (policy + guardrail enforcement). CON-70 caveat:
per-tenant _resolution_ blocked on multi-tenancy (tenant claim null; CON-52 follow-up) — platform
ingestion + owner-scoped storage land now.

**New sub-issues filed this session:** **CON-73** (Terminus Broadcast — OpenRouter-style trace
fan-out to BYO observability destinations, under CON-41), **CON-74** (streaming-request fallback /
peek-first-chunk redesign, deferred from CON-71).

**PR1 landed (2026-06-17), TDD, all green — 109 unit + 37 D1-integration:** pool columns +
label-keyed unique (one clean migration); pure `orderCandidates`; vault candidate read/decrypt +
best-effort health writers + admin CRUD + codex-near-expiry; retry/cooldown classification;
`forModelCandidates` + non-streaming fallback loop (streaming stays single-candidate → CON-74);
codex cron refreshes every owner; `/admin/credentials` ingestion API behind `TERMINUS_ADMIN_SECRET`
(+ terraform). Closes **CON-70**; advances **CON-71** (PR2 = L2 routing policy + RBAC guardrails).
Task 11 (catalog owner-threading) deferred — no present value while the tenant claim is null. **PR
[#14](https://github.com/AletheiaResearch/orthogonal/pull/14)** open (base `terminus`; never merge).
Bot review (CodeRabbit + Codex) addressed in `932bcd7`: `cooldownUntilMs` rename, fallback treats
`GatewayError` as terminal + builds request options once, `failureCount` threaded into the cooldown,
admin 409-only-on-unique-constraint, HTTP-date Retry-After test; `.toSorted()` kept
(oxlint-enforced + workerd-supported — recorded as a CodeRabbit Learning). **Migration P1
resolved:** the repo/terminus has never been deployed, so regenerating the single `0000` is correct
(no persistent D1 to break); future post-deploy changes will be additive. Deferred follow-ups logged
on CON-70 (delete-vs-env-reseed; admin api_key-only) + CON-71 (all-cooled-down → 503).

## Session 2026-06-17 (cont.) — CON-71 PR2 (L2 guardrails) started

**Worktree:** `.claude/worktrees/con-71-policy-guardrails` on branch `nejc/con-71-policy-guardrails`
(off `terminus`; single issue id — does NOT carry `con-70`/`con-41`). Base for the PR = `terminus`.

**⚠️ Scope reversal (Nejc, 2026-06-17).** L2 is **guardrails only** — a versioned RBAC policy that
_gates_ (allow/deny models + providers) and _clamps_ (output-token cap). The earlier
"forced-default-routing" framing — `forceModel`, `routes`/`chain`, cross-provider fallback — is
**cut**: Terminus never substitutes or reroutes the requested model ("we're not Anthropic — no black
magic"). L1's same-provider key-pool rotation (shipped) is unaffected (rotating your own keys for
the same model ≠ rerouting). The design spec
([`docs/terminus-routing-byok-design.md`](terminus-routing-byok-design.md)) was rewritten in place
to this scope (§§4, 6, 7, 8, 10, 11) — it is the source of truth; this tracker does not duplicate
it.

**Decisions locked this session (2 AskUserQuestion rounds + advisor):** (1) **Versioned policy
storage + admin API** — `policies` + `policy_versions` (renamed from `routers*` — no routing), with
a policy admin API (create-version / set-active / rollback / list) so the versioning has a live
writer (rule #7). (2) **BYOK scope encoded now, dormant** — `credentialScope` + `byokServiceFeeBps`
in the JSON blob (not columns; validated + stored but read by no v1 code). (3) **Defense-in-depth**
— the policy stacks on the signed `claims.allowed_models`, never widens it. (4) **Fail-closed on
policy load** — policy-absent → pass-through; policy-configured-but-unloadable → 5xx. (5)
`applyGuardrails` splits `provider/model` identically to `resolveModelRef` (no bypass/phantom-403).

**Landed (TDD, all green — 151 unit + 56 D1-integration):** `policy/blob.ts` (discriminated-union
validator), `splitModelId` extracted from `resolveModelRef` (shared provider split), `policyDenied`
403 + `policyUnavailable` 503 errors, `policy/guardrails.ts` (`applyGuardrails` gate + token clamp,
fail-closed on unparseable id), `policies`/`policy_versions` schema (one clean regened migration),
`policy/store.ts` (active-version lookup + module-level TTL cache incl. null + lazy seed + admin
CRUD via `db.batch`), `chat.ts` enforcement before resolve (defense-in-depth on
`claims.allowed_models`), policy admin API (`/admin/policies…`), `index.ts`/`env.ts` wiring
(`TERMINUS_GATEWAY_POLICY`, `env.DB`-guarded default store), terraform binding, end-to-end
real-store enforcement test. Verify gate clean (typecheck / fmt:check / `tofu fmt` on touched files;
lint warnings-only). **PR open (base `terminus`; never merge).** Closes **CON-71**.

Deferred to the BYOK PR (gated on multi-tenancy; see spec §3b): `forced`/`unforced` column on
`provider_credentials`, per-tenant owner derivation in `forModelCandidates`, the BYOK→platform
fallback edge, reading `credentialScope`, service-fee accounting.

## Continuation prompt (paste into a fresh session) — post-PR-#16

> Continue Linear epic **CON-41** (Terminus LLM gateway). **Work in a git worktree off the
> `terminus` branch.** Read this doc (`docs/terminus-llm-gateway.md`) first — design + living
> tracker (shown live in the cmux markdown viewer); keep it updated as you go. The CON-71/CON-70
> source-of-truth spec is `docs/terminus-routing-byok-design.md`.
>
> **State (merged to `terminus`):** the gateway spine (CON-48/49/51/52/54-scoped, PR #12), CON-50
> (Codex OAuth + Terminus-owned credential vault) + CON-53 (OpenCode wiring) (PR #13), CON-71 L1
> credential pool + CON-70 platform ingestion (PR #14), and **CON-71 L2 guardrail policy (PR #16)**.
> Sub-issue states: CON-48/50/53/70/71 **Done**; CON-49/51/52 In Review (foundation); CON-54/72/73
> /74/75 open. The gateway still ships **gated default-OFF** (per-session `llmGatewayEnabled`).
>
> **What CON-71 L2 (PR #16) shipped:** a versioned, owner-scoped RBAC **guardrail policy**
> (`policies` + `policy_versions`) — `applyGuardrails` gates allow/deny models+providers (403) and
> clamps `max_output_tokens` (bounded by the model's `limit.output`); enforced in `chat.ts` +
> `/v1/models` (discovery matches enforcement); fail-closed (503) when a configured policy can't
> load / a policy row has no active version; race-safe lazy seed from `TERMINUS_GATEWAY_POLICY`;
> policy admin API under `/admin`. **No model substitution / rerouting** — that was cut by decision.
> Dormant forward-compat fields in the blob: `credentialScope` + `byokServiceFeeBps`.
>
> **⚠️ The gate before flipping `llmGatewayEnabled` default-ON = a LIVE smoke test on a pinned-
> OpenCode sandbox** (not CI-coverable): (1) config-hook provider registration in
> `sandbox-runtime/.../plugins/gateway-plugin.js`; (2) `gateway/<provider>/<model>` default-model
> routing in `entrypoint.py`; and (3) **CON-75** (per-prompt model override in `bridge.py` bypasses
> the gateway — a real pre-toggle-ON blocker). Don't flip the default until all three are proven
> live.
>
> **Roadmap (Nejc), in order:** (1) the **dashboard issue** — natural home for CON-70's ingestion UI
>
> - a CF-AI-Gateway-style **node-builder that authors the CON-71 guardrail policy** blob; (2) the
>   deferred **BYOK PR** (per spec §3b: a `forced`/`unforced` column on `provider_credentials`, per-
>   tenant owner derivation in `forModelCandidates`, the BYOK→platform fallback edge, reading
>   `credentialScope`, service-fee accounting) — gated on multi-tenancy / a non-null identity claim
>   (CON-52 follow-up); **no dedicated Linear issue exists for it yet — file one (estimate ~8) or
>   fold into CON-70/CON-52**; (3) open sub-issues **CON-72** (rollout: pre-gateway-snapshot
>   `llm_secrets` + gate user keys), **CON-75** (per-prompt override), **CON-74** (streaming
>   fallback), **CON-73** (Broadcast), **CON-54** (durable metering — blocked on the timeseries-DB
>   choice); (4) the live smoke test → flip the toggle ON; (5) a PR **`terminus → main`**; try, iron
>   out, merge.
>
> **Branch/PR rules:** branch off `terminus`; the name must **NOT** contain `con-41` (auto-closes
> the epic) and must carry **exactly ONE** issue id (PR #14's `con-71-con-70` branch auto-closed
> both on merge); open the PR with base **`terminus`**; `git push origin HEAD:<branch>`. **Never
> self-merge unless Nejc explicitly authorizes** (he authorized merging PR #16).
>
> **Cost/efficiency (Nejc, when Opus quota is tight):** hand code-review **finding analysis** to the
> Codex plugin (`codex:codex-rescue`) — it edits the worktree + drafts replies; do the mechanical
> **get/apply/post/resolve** with a **Sonnet** agent (`model: sonnet`); keep Opus for orchestration
> only. Always set a Linear **estimate** on new sub-issues (Constructor scale 1/2/4/8). Resolving
> Codex review threads via GraphQL `resolveReviewThread` is part of the standing workflow.
>
> **Repo rules:** build `@open-inspect/shared` first; conventional commits; **sole author Nejc
> Drobnič — never add a Co-Authored-By or any AI-attribution footer (incl. PR bodies)**; pnpm
> catalog is `strict` with a 7-day `minimumReleaseAge`; **TDD** (test first, watch it fail);
> **verify before done** — `pnpm --filter @open-inspect/shared build` →
> `pnpm --filter @orthogonal/terminus typecheck && test && run test:integration` (workerd/Miniflare
> D1) → `pnpm fmt:check` (oxfmt covers `.md`) → `pnpm lint` (oxlint; warnings ok, must exit 0).
> **`tofu`/`terraform fmt` is NOT CI-gated** (CI runs only `pnpm fmt:check`); still keep touched
> `.tf` formatted. Call the **advisor** before committing to an approach + before declaring done
> (skip when conserving Opus on mechanical work).
>
> **Linear:** move each sub-issue through its own lifecycle (In Progress → In Review + link the PR;
> Done on merge) **with an estimate**; comment durable decisions; reply to **CodeRabbit** threads
> tagging **@coderabbitai** to record Learnings; resolve **Codex** threads via GraphQL once
> addressed. Keep **CON-41 In Progress** until the whole epic lands.
>
> **Gotchas:** (a) subagents (Workflow + `codex:codex-rescue`) may resolve absolute paths to the
> main repo, not the worktree — pass the explicit worktree path + `git status` after. (b) The
> `codex:codex-rescue` sandbox **cannot bind `127.0.0.1`** (Miniflare integration tests EPERM there)
> — run `test:integration` in the main session / via a Sonnet agent, not inside Codex. (c)
> Pre-commit lint-staged OOM-kills on large staged sets — after verifying `fmt:check` + `lint`,
> commit `--no-verify`. (d) Drizzle migration regen is one clean file **only while terminus is
> undeployed** (it is): edit `schema.ts`, then
> `rm -rf services/terminus/migrations && pnpm --filter @orthogonal/terminus db:generate`; switch to
> additive `000N` after the first deploy. (e) terminus D1 tests run via the Miniflare-D1 harness
> (`readD1Migrations`); terraform applies via `scripts/d1-migrate.sh`.
