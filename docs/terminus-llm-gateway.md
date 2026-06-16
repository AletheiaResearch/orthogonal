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

## Unknowns to verify before/while building (don't assume)

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

- [~] Verify the 4 unknowns above (background workflow running)
- [x] Scaffold `services/terminus` (package.json, tsconfig, vite, wrangler.toml, oxlint) matching
      the bots — installs/typechecks/builds green
- [x] Add `services/terminus` to `pnpm-workspace.yaml`
- [x] shared: `gateway-token.ts` (mint/verify) + export + build — 11 tests green
- [ ] auth middleware + token verify (CON-52)
- [ ] catalog from models.dev + `/v1/models` (CON-49)
- [x] credential resolver interface + env-key impl (CON-51) — 8 tests green
- [ ] provider router (default openai-compatible + anthropic/openai overrides) (CON-48)
- [ ] chat route: streamText → OpenAI-compat SSE + non-stream (CON-48)
- [ ] UsageSink seam (no-op) for CON-54
- [ ] Vitest unit tests (token, catalog filter, resolver, SSE mapping w/ mocked upstream)
- [ ] Terraform worker module instance + secrets + KV
- [ ] build/typecheck/lint/test green; update this doc
- [x] Linear: comments on CON-51 + CON-52 for deferred items
