# Terminus routing + BYOK — design spec (CON-71 + CON-70)

**Status:** Approved-in-principle (scope locked with Nejc 2026-06-17) · **Branch:**
`nejc/con-71-con-70-gateway-routing-byok` (off `terminus`) · **Issues:** CON-71 (LB/routing), CON-70
(BYOK/per-tenant + ingestion) · **Spec is source of truth** — `docs/terminus-llm-gateway.md` points
here, does not duplicate.

> Defers → **CON-74** (streaming-request fallback), the **node-graph interpreter/serialization** (→
> dashboard phase), and **per-tenant resolution** (→ multi-tenancy / CON-52 follow-up).

## 1. Goal

Evolve the Terminus credential vault from **one credential per `(owner, provider)`** into a
**configurable, RBAC-guarded routing layer**: multiple credentials per provider (rotation/rate-limit
pools + Codex multi-account), platform-controlled default routing + fallback, and a server-side
routing policy that **forces/clamps request params** so a leaked gateway JWT cannot escape its
domain. Plus CON-70's platform **ingestion/admin API** (replacing the Terraform-seed-only path) and
owner plumbing.

LiteLLM / OpenRouter / Helicone are the references; the verified data points (vs Helicone's OSS
`ai-gateway`):

- **Three failure mechanisms are distinct and must not be conflated:** load-balancer **selection**
  among healthy creds ≠ per-request **retry to the same target** ≠ health/rate-limit **ejection**
  (cooldown). Cross-target "fallback" = ejection-then-reselect, not the retry layer.
- Helicone stores routing as a **versioned config blob** (`routers` + `router_config_versions`),
  validated at write, read at request time. Credential uniqueness is on `(owner, key_name)` with
  `provider` a separate column → **multiple named keys per `(owner, provider)`**.

## 2. Current state (verified against the code)

`services/terminus/src/db/schema.ts` — single table `provider_credentials`:

- Columns: `id` PK, `owner_type` (`platform`|`tenant`, default `platform`), `owner_id` (default
  `''`, also the AES-GCM **AAD**), `provider`, `credential_mode` (`api_key`|`codex-oauth`),
  `secret_encrypted` (AES-256-GCM base64), `expires_at` (ms, **plaintext** for the cron), `enabled`
  (bool), `config` (nullable JSON — declared, **read by no code today**), `created_at`/`updated_at`.
- `UNIQUE INDEX provider_credentials_owner_provider (owner_type, owner_id, provider)` — **the
  single-credential blocker.**
- `CHECK provider_credentials_tenant_owner_id`: `owner_type='platform' OR owner_id<>''` (owner
  isolation).

`db/vault.ts` `CredentialVault` — `getCredential` does `.limit(1)` over the unique index; `upsert`
and `seedCodexCredential` both target `onConflict (owner_type, owner_id, provider)`; AES-GCM AAD =
`` `${type}:${id}` ``; decrypt only in-isolate; disabled rows terminal; default owner everywhere is
`PLATFORM_OWNER {type:'platform', id:''}`.

`credentials/provider.ts` `VaultCredentialProvider.forModel(ref, _sid)` — **ignores `sid`**,
resolves `PLATFORM_OWNER` only; Codex via `CodexTokenManager`; lazy env-seed for plain providers;
per-request instance with provider-id-Set caches (`enabledCache`/`allCache`).

`routes/chat.ts` — `allowed_models` gate (`claims.allowed_models`), then `resolveModelRef` →
`forModel(ref, claims.sid)` → `buildLanguageModel` → `streamText` (sync, errors surface in
`fullStream` **after** the Response commits) / `await generateText` (cleanly try/catch-able). Usage
emit is best-effort via `c.executionCtx.waitUntil`.

`credentials/codex-manager.ts` — `getAccessToken` / `refreshIfNearExpiry` (cron) read the **single**
platform codex row; sole refresher; 401-reread on concurrent rotation.

`index.ts` — per-request `VaultCredentialProvider`; `scheduled()` cron refreshes platform codex
only; `/v1/models` via `buildModelsList(registry, resolver, allowed_models)` (PLATFORM_OWNER only).

## 3. Locked decisions (brainstorm + advisor)

1. **Defer the node graph.** v1 ships a **structured platform routing-policy** (not a node-graph
   interpreter). The CF-style node-builder is the future _authoring UI_ for this same policy
   (dashboard, separate session). Designing a graph serialization against a non-existent UI risks a
   rewrite; the migration is regenerable/undeployed, so deferring is free.
2. **Helicone versioned-storage model** for the policy: `routers` + `router_config_versions`
   (owner-scoped, mirrors `provider_credentials`). v1 seeds **one platform-default router**; the
   config blob is the structured policy (forward-compatible — later versions can carry richer/graph
   blobs).
3. **RBAC = platform-default, terminus-only.** One platform policy applied to all gateway tokens,
   enforced **server-side in terminus** — no new signed claims, no control-plane minting, no
   `@open-inspect/shared` churn. Per-_identity_ policies arrive with multi-tenancy.
4. **Multi-credential pool** via a `label` column → `UNIQUE(owner_type, owner_id, provider, label)`;
   both `onConflict` targets migrate.
5. **Fallback = non-streaming only** in v1; streaming (peek-first-chunk) → **CON-74**.
6. **CON-70 now = platform ingestion/admin API + owner plumbing**; per-tenant writes/resolution
   deferred (AES-GCM AAD binds ciphertext to owner; tenant claim is null).
7. **Decision rule:** add a table/column **only if v1 code reads or writes it** for present value.
   (Kills "dark config tables" and any speculative columns.)

## 4. Architecture — two layers + enforcement

The two **persisted** layers are L1 (credential pool) and L2 (routing policy). L2's policy is
enforced at two request-time points: **guardrails** (a pre-resolve request rewrite — the RBAC clamp)
and the **routing chain** (candidate expansion).

```
        ┌──────── L2 policy · guardrails (terminus-only, PR2) ───────────────┐
request │ force model / clamp params / hard-gate allowed (server-side)        │ ← leaked-JWT safe
        └────────────────────────────────┬──────────────────────────────────┘
                                          ▼
        ┌──────── L2 policy · routing chain (PR2) ───────────────────────────┐
        │ active router config version → ordered routing chain (provider,byok)│
        └────────────────────────────────┬──────────────────────────────────┘
                                          ▼  yields ordered candidate stages
        ┌──────── L1 credential pool (PR1) ──────────────────────────────────┐
        │ within (owner,provider): filter cooled-down → priority tier →       │
        │ weighted shuffle → ordered candidates; non-streaming fallback on    │
        │ retryable error; best-effort cooldown/failure recording off-path    │
        └────────────────────────────────┬──────────────────────────────────┘
                                          ▼
                    buildLanguageModel → streamText/generateText → usage sink
```

L1 alone (PR1) delivers rotation/rate-limit pools + intra-provider fallback. L2 (PR2) adds
cross-provider routing chains + the RBAC clamp. All compose into **one ordered candidate list** the
`chat.ts` loop walks.

## 5. Data model

### 5.1 `provider_credentials` changes (PR1)

Add (all with safe defaults so existing single-key rows keep working):

| Column           | Type / default                    | Used by v1 for                                                         |
| ---------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `label`          | `TEXT NOT NULL DEFAULT 'default'` | disambiguate multiple creds per `(owner,provider)`; part of new unique |
| `priority`       | `INTEGER NOT NULL DEFAULT 0`      | selection: higher = preferred tier (tried first)                       |
| `weight`         | `INTEGER NOT NULL DEFAULT 1`      | weighted-random pick within a priority tier (must be ≥1)               |
| `cooldown_until` | `INTEGER` (nullable, ms)          | skip candidate while `now < cooldown_until`; set on retryable failure  |
| `failure_count`  | `INTEGER NOT NULL DEFAULT 0`      | escalating backoff; reset to 0 on success                              |

- **Replace** `UNIQUE(owner_type, owner_id, provider)` →
  `UNIQUE(owner_type, owner_id, provider, label)`.
- **Migrate both `onConflict` targets** in `vault.ts` (`upsert`, `seedCodexCredential`) to the
  4-column key. (Otherwise upserts throw / silently no-op — explicit regression risk.)
- Keep the `CHECK` (owner isolation). No `last_used_at` (weighted shuffle is stateless — YAGNI).
- Migration is regenerated as **one clean file** (table not deployed): edit `schema.ts`, then
  `rm -rf services/terminus/migrations && pnpm --filter @orthogonal/terminus db:generate`.

### 5.2 `routers` + `router_config_versions` (PR2)

```
routers
  id           TEXT PK
  owner_type   TEXT NOT NULL DEFAULT 'platform'   -- mirrors provider_credentials
  owner_id     TEXT NOT NULL DEFAULT ''
  name         TEXT NOT NULL                       -- e.g. 'platform-default'; future: model alias
  enabled      INTEGER (bool) NOT NULL DEFAULT true
  created_at / updated_at  INTEGER NOT NULL
  UNIQUE(owner_type, owner_id, name)

router_config_versions
  id           TEXT PK
  router_id    TEXT NOT NULL REFERENCES routers(id)
  version      INTEGER NOT NULL                    -- monotonic per router
  config       TEXT NOT NULL                       -- validated JSON policy blob (§6)
  is_active    INTEGER (bool) NOT NULL DEFAULT false
  created_at   INTEGER NOT NULL
  UNIQUE(router_id, version)
  UNIQUE INDEX (router_id) WHERE is_active = 1      -- exactly one active version per router
```

Rollback = flip `is_active` to an older version (the draft/deploy story). v1 seeds one
platform-default router + an initial active version (from a Worker-secret/Terraform JSON, parsed +
validated at seed).

## 6. Routing-policy config blob (PR2)

Stored as `router_config_versions.config` (validated JSON). v1 schema — does **forced routing** +
**guardrails**, no graph:

```jsonc
{
  "schemaVersion": 1,
  // Forced default routing. First matching rule wins; produces an ordered fallback chain.
  "routes": [
    {
      "when": { "provider": "openai", "byok": false }, // v1 match keys: provider, byok
      "chain": [
        { "target": "pool", "provider": "openai" }, // L1 pool for openai
        { "target": "provider", "provider": "codex", "model": "gpt-5-codex" }, // then codex-oauth
      ],
    },
  ],
  // Guardrails (RBAC) — applied server-side regardless of client input (the leaked-JWT clamp).
  "guardrails": {
    "forceModel": null, // if set, overrides body.model unconditionally
    "allowedModels": null, // null/absent = unrestricted; else hard allow-gate
    "deniedModels": [],
    "allowedProviders": null,
    "deniedProviders": [],
    "maxOutputTokensCap": null, // clamp max_completion_tokens / max_tokens
  },
}
```

Validated by a discriminated-union parser at **write** (seed/admin) — never trust the stored blob
shape at read. The blob is intentionally a **superset-friendly** structure: later versions can add
node-graph fields under new `schemaVersion`s without breaking the reader (which switches on
`schemaVersion`).

**Interaction with `claims.allowed_models`:** the signed claim stays a coarse outer bound;
`guardrails.allowedModels` is the platform policy gate. Effective allow = intersection. `forceModel`
takes precedence, then the gates apply (a forced model must itself satisfy the gates or it's a
config error, caught at seed/validate).

## 7. Components (one purpose each)

**PR1 (CON-70 + CON-71 L1):**

- `db/schema.ts` — add the 5 columns + new unique (§5.1).
- `credentials/selection.ts` _(new, pure)_ — `orderCandidates(rows, now, rng)`: filter cooled-down →
  group by `priority` desc → weighted shuffle by `weight` within the top tier (then remaining tiers,
  ordered) → `ProviderCredentialRow[]`. Pure + deterministic under an injected RNG (testable).
- `db/vault.ts` — `getCredentials(provider, owner): rows[]` (enabled, for selection; **no
  decrypt**), `decryptById(id, owner)` (decrypt one chosen candidate),
  `recordFailure(id, cooldownUntil)` / `recordSuccess(id)` (best-effort), migrated `onConflict`
  targets, and **admin CRUD**: `createCredential` / `listForOwner` / `setEnabled` /
  `deleteCredential` (label-aware, owner-scoped).
- `credentials/provider.ts` — `forModelCandidates(ref, owner): UpstreamCredential[]`-style ordered
  candidates (each carries the row `id` so the loop can record failure + try the next); `forModel`
  keeps returning the first candidate (back-comp). Owner derived from claims (platform while
  `tenant` null).
- `routes/admin.ts` _(new)_ — authenticated platform ingestion: `POST/GET/PATCH/DELETE` over
  `provider_credentials` for the platform owner. Auth =
  `Authorization: Bearer ${TERMINUS_ADMIN_SECRET}` (constant-time compare), fail-closed.
- `routes/chat.ts` — non-streaming **candidate fallback loop**: walk ordered candidates; build +
  `await generateText`; on **retryable** error (429/5xx/network) `recordFailure`+cooldown and try
  the next; on success `recordSuccess`; after all fail → deterministic gateway error. **Streaming
  unchanged** (single candidate, fail-fast) → CON-74. Retry **classification** lives in one shared
  helper (`errors.ts` or `routing/`): 429/5xx/network = retryable; 400/401/403 = terminal (don't
  amplify a bad request across the pool).
- `credentials/codex-manager.ts` — cron `refreshIfNearExpiry` iterates **all** near-expiry codex
  rows (needs a `vault.listCodexRowsNearExpiry(now+buffer)`), not just the platform row, so a Codex
  pool doesn't go stale. `getAccessToken` selects a healthy codex candidate (minimal in v1). Still
  sole refresher.
- `catalog/catalog.ts` + `index.ts` — thread `owner` into `buildModelsList` / `isEnabled` (no-op
  while `tenant` null; keeps the parallel, decrypt-free enablement path). Mount `routes/admin.ts`.
- `env.ts` — `TERMINUS_ADMIN_SECRET`.

**PR2 (CON-71 L2 + L3):**

- `routing/policy.ts` _(new)_ — policy schema + validator + the resolver:
  `applyGuardrails(body, policy)` (force/clamp/gate; the leaked-JWT clamp) and
  `routeChain(ref, byok, policy): RoutingStage[]`.
- `routing/policy-store.ts` _(new)_ — read the active `router_config_versions.config` for the
  applicable router; in-isolate cache keyed by `(router, version)`; seed/validate from
  Terraform/Worker-secret JSON.
- `routes/chat.ts` — front the resolution with `applyGuardrails` (before `resolveModelRef`) and
  expand the candidate list across `routeChain` stages (L2 chain × L1 pool) into the same loop.
- `env.ts` + Terraform — the platform-policy seed secret; `routers`/`router_config_versions`
  migration (regen, still one clean file until first deploy).

## 8. Request flow (PR2, end state)

```
verify token → applyGuardrails(body, policy)        # force model / clamp max tokens / hard-gate → 403
  → resolveModelRef(rewritten model)                # 404 unknown
  → routeChain(ref, byok, policy) → stages[]        # platform default routing (e.g. openai pool → codex)
  → for each stage: getCredentials(provider, owner) → orderCandidates → for each candidate:
        decryptById → buildLanguageModel → generateText
        success → recordSuccess, emit usage, return
        retryable failure → recordFailure(cooldown), next candidate/stage
  → all exhausted → deterministic gateway error (fail-closed, never silent pass-through)
```

Streaming keeps today's single-candidate path until CON-74.

## 9. Error handling / invariants (must preserve)

- **Fail-closed:** unknown model 404, forbidden/guardrail-violation 403, unsupported adapter 501,
  all candidates exhausted → 502; never silently pass through.
- **AES-GCM AAD per owner:** decrypt each candidate with its exact owner AAD; never widen AAD for
  cross-owner reads.
- **In-isolate only:** decrypted secrets + the policy cache live in-isolate, never KV. New caches
  key by owner (and `(router,version)` for policy) and hold no plaintext beyond the isolate.
- **Best-effort writes:** `recordFailure`/`recordSuccess` and usage emit must **never** fail a good
  completion (catch+log, off the hot path via `waitUntil`).
- **Disabled rows terminal;** seeding stays insert-if-absent + idempotent under the new unique key
  (Codex single-use-token safety).
- **Drizzle parameterized only** — no raw SQL, incl. new selection/candidate queries.
- **Codex sole refresher;** `expires_at` stays plaintext.

## 10. Phasing & PRs (both base `terminus`)

- **PR1 — CON-70 + CON-71 L1.** §5.1 migration + `selection.ts` + vault candidate selector/recorders
  - admin ingestion API + owner plumbing + non-streaming fallback + Codex cron-iterate-all. Closes
    **CON-70**; advances **CON-71**. Terminus-only, reviewable, delivers rotation pools + ingestion.
- **PR2 — CON-71 L2 (routing + RBAC guardrails).** §5.2 tables + §6 policy + resolver + guardrail
  enforcement + chain routing. Focused **security review** (leaked-JWT clamp). Closes **CON-71**.
- **Deferred (explicit):** node-graph schema/interpreter + Conditional/Percentage/Budget nodes +
  node-builder UI → dashboard; per-identity policies → multi-tenancy; streaming fallback →
  **CON-74**.

## 11. Test strategy (TDD — test first, watch it fail)

**Unit (node, `src/**/\*.test.ts`):\*\*

- `selection.ts`: cooled-down exclusion; priority-tier ordering; weighted shuffle determinism under
  injected RNG; single-row back-comp.
- retry classification: 429/5xx/network retryable; 400/401 terminal.
- `chat.ts` fallback loop (via injected `buildModel`/fake `CredentialProvider`): first candidate
  rate-limits → second succeeds; auth error → fast-fail no retry; all fail → 502; **streaming path
  unchanged** (one candidate).
- PR2 `policy.ts`: `forceModel` override; `maxOutputTokensCap` clamp; allow/deny gates (incl. leaked
  token requesting a denied model → 403); `routeChain` ordering; blob validation rejects bad shapes.

**D1 integration (Miniflare, `test/integration/`):**

- Clean migration applies (regened file).
- Multi-credential pool end-to-end: stubbed upstream rate-limits cred A (cooldown written) → cred B
  serves; cooled-down cred excluded next call.
- Admin CRUD: create/list/enable/delete with auth; unauthorized → 401; owner-scoping.
- Codex cron rotates **two** near-expiry codex rows.
- PR2: active-version lookup + in-isolate cache; rollback (flip `is_active`); guardrail enforcement
  end-to-end.

**Gate before "done"** (per repo rules): `pnpm --filter @open-inspect/shared build` →
`pnpm --filter @orthogonal/terminus typecheck && test && test:integration` → `pnpm fmt:check` →
`pnpm lint` → `tofu fmt -check` for any `.tf`. Advisor before declaring done.

## 11b. Implementation status — PR1 landed (2026-06-17)

PR1 (CON-70 + CON-71 L1) is implemented on `nejc/con-71-con-70-gateway-routing-byok`, TDD, all
green: **109 unit + 37 D1-integration** tests; typecheck / `fmt:check` / `tofu fmt` clean; lint
warnings-only (consistent with the repo's existing `no-await-in-loop` set — the fallback loop is
correct-by-design sequential). Shipped: pool columns + label-keyed unique (one clean migration);
`orderCandidates`; vault candidate read/decrypt + health writers + admin CRUD + codex-near-expiry;
retry/cooldown classification; `forModelCandidates` + non-streaming fallback (`maxRetries:0` on that
path only — streaming keeps the SDK default); codex cron refreshes every owner; `/admin/credentials`
ingestion API (+ `TERMINUS_ADMIN_SECRET` worker secret / terraform).

**Deferred from PR1 (no present value in v1):** catalog owner-threading (Task 11) — the tenant claim
is null, so the catalog is already correctly platform-scoped; owner-threading lands with
multi-tenancy when it's actually exercised. **PR2** = L2 routing policy + RBAC guardrails (plan
unchanged).

## 12. Open / to confirm at review

- Priority semantics: **higher = preferred** (documented in `schema.ts`). Confirm vs "lower =
  first".
- Admin API surface shape (REST paths) finalized in PR1 implementation.
- Whether PR1 + PR2 land as two sequential PRs to `terminus` or one combined PR (lean: two, for the
  focused security review of PR2).
