# Terminus routing + BYOK — design spec (CON-71 + CON-70)

**Status:** PR1 landed (CON-70 + CON-71 L1) · PR2 scope locked (CON-71 L2 — guardrails) · **PR2
branch:** `nejc/con-71-policy-guardrails` (off `terminus`) · **Issues:** CON-71 (pool + guardrails),
CON-70 (BYOK/per-tenant + ingestion) · **Spec is source of truth** — `docs/terminus-llm-gateway.md`
points here, does not duplicate.

> Defers → **CON-74** (streaming-request fallback), the **node-graph interpreter/serialization** (→
> dashboard phase), and **per-tenant resolution** (→ multi-tenancy / CON-52 follow-up).

> **PR2 re-scope (2026-06-17, Nejc).** L2 is **guardrails only** — a versioned RBAC policy that
> _gates_ (allow/deny models + providers) and _clamps_ (output-token cap). The earlier "forced
> default routing" framing — `forceModel`, `routes`/`chain`, cross-provider fallback — is **cut**:
> Terminus never substitutes or reroutes the model the caller asked for. If you request a model and
> you're allowed, you get exactly that model; if you're not allowed, you get a clean 403 — never a
> silent swap. (Rationale: "we're not Anthropic — no black magic.") L1's same-provider key-pool
> rotation (already shipped) is unaffected: rotating among _your own keys for the same
> provider+model_ is not rerouting. §§4, 6, 7, 8, 10, 11 below are rewritten to this scope; the old
> routing-chain text is gone, not parked in a parallel section.

## 1. Goal

Evolve the Terminus credential vault from **one credential per `(owner, provider)`** into a
**credential pool (L1, shipped) + an RBAC guardrail policy (L2)**: multiple credentials per provider
(rotation/rate-limit pools + Codex multi-account), plus a server-side, versioned **guardrail
policy** that **gates which models/providers a token may use and clamps output limits** — so a
leaked gateway JWT cannot escape its domain. Terminus **never** substitutes or reroutes the
requested model. Plus CON-70's platform **ingestion/admin API** (replacing the Terraform-seed-only
path) and owner plumbing.

LiteLLM / OpenRouter / Helicone are the references for the _pool + versioned-config_ shape; the
verified data points (vs Helicone's OSS `ai-gateway`):

- **Three failure mechanisms are distinct and must not be conflated:** load-balancer **selection**
  among healthy creds ≠ per-request **retry to the same target** ≠ health/rate-limit **ejection**
  (cooldown). Cross-target "fallback" = ejection-then-reselect, not the retry layer. (All three stay
  **within one provider+model** — same-model key rotation, not model substitution.)
- Helicone stores routing as a **versioned config blob** (`routers` + `router_config_versions`),
  validated at write, read at request time. We adopt that **versioned-config storage shape** for the
  guardrail policy (renamed `policies` + `policy_versions`, see §5.2) — not its model-rerouting
  semantics.

## 2. Current state (verified against the code)

`services/terminus/src/db/schema.ts` — single table `provider_credentials`:

- Columns: `id` PK, `owner_type` (`platform`|`tenant`, default `platform`), `owner_id` (default
  `''`, also the AES-GCM **AAD**), `provider`, `credential_mode` (`api_key`|`codex-oauth`),
  `secret_encrypted` (AES-256-GCM base64), `expires_at` (ms, **plaintext** for the cron), `enabled`
  (bool), `config` (nullable JSON — declared, **read by no code today**), `label`, `priority`,
  `weight`, `cooldown_until_ms`, `failure_count`, `created_at`/`updated_at`.
- `UNIQUE INDEX provider_credentials_owner_provider_label (owner_type, owner_id, provider, label)` —
  the **label-keyed pool key** (PR1 relaxed the old 3-column unique).
- `CHECK provider_credentials_tenant_owner_id`: `owner_type='platform' OR owner_id<>''` (owner
  isolation).

`db/vault.ts` `CredentialVault` — `getCredentials(provider, owner)` returns the enabled pool rows
(no decrypt); `decryptById(id, owner)` decrypts one chosen candidate;
`recordFailure`/`recordSuccess` write cooldown/failure state best-effort; admin CRUD
(`createCredential`/`listForOwner`/`setEnabled`/ `deleteCredential`); `upsert`/`seedCodexCredential`
target `onConflict (owner_type, owner_id, provider, label)`; AES-GCM AAD = `` `${type}:${id}` ``;
decrypt only in-isolate; disabled rows terminal; default owner everywhere is
`PLATFORM_OWNER {type:'platform', id:''}`.

`credentials/provider.ts` `VaultCredentialProvider.forModelCandidates(ref, _sid)` — **ignores
`sid`**, resolves `PLATFORM_OWNER` only; `orderCandidates` over the pool rows; Codex via
`CodexTokenManager` (single synthetic candidate); lazy env-seed for plain providers; per-request
instance with provider-id-Set caches (`enabledCache`/`allCache`). `recordSuccess`/`recordFailure`
no-op the synthetic codex id.

`routes/chat.ts` — `allowed_models` gate (`claims.allowed_models`), then `resolveModelRef` →
`forModelCandidates(ref, claims.sid)` → non-streaming **fallback loop** (`generateText`,
`maxRetries:0`, cooldown on retryable failure) / single-candidate `streamText` (errors surface in
`fullStream` **after** the Response commits → CON-74). Distinguishes all-cooled-down (503) from
unconfigured (502). Usage emit + health writes best-effort via `c.executionCtx.waitUntil`.

`credentials/codex-manager.ts` — `getAccessToken` / `refreshIfNearExpiry` (cron) over codex rows
(near-expiry across all owners); sole refresher; 401-reread on concurrent rotation.

`routes/admin.ts` — `/admin/credentials` ingestion API behind `TERMINUS_ADMIN_SECRET` (constant-time
bearer compare, fail-closed); never returns secrets.

`index.ts` — per-request `VaultCredentialProvider`; `scheduled()` cron refreshes codex; `/v1/models`
via `buildModelsList(registry, resolver, allowed_models)` (PLATFORM_OWNER only); mounts `/admin`.

## 3. Locked decisions (brainstorm + advisor)

1. **No model substitution / rerouting (PR2 reversal).** L2 is **guardrails only** — gate
   (allow/deny models + providers) + clamp (output-token cap). No `forceModel`, no `routes`/`chain`,
   no cross-provider fallback. The caller always gets the model it asked for, or a 403.
2. **Defer the node graph.** v1 ships a **structured guardrail policy** (not a node-graph
   interpreter). The CF-style node-builder is the future _authoring UI_ for this same policy
   (dashboard, separate session). The migration is regenerable/undeployed, so deferring is free.
3. **Helicone versioned-storage shape** for the policy: `policies` + `policy_versions`
   (owner-scoped, mirrors `provider_credentials`). v1 auto-seeds **one platform-default policy** +
   an initial active version; the config blob is the structured guardrail policy (forward-compatible
   — later `schemaVersion`s can carry richer blobs).
4. **Versioned policy + admin API (Nejc).** Build the full versioned storage (monotonic `version`,
   `is_active`, rollback) **with a live writer**: a policy admin API (create-version / set-active /
   list) mirroring `/admin/credentials`. This gives the versioning present value (rule #7 below) and
   is the API the dashboard calls later.
5. **RBAC = platform-default, terminus-only.** One platform policy applied to all gateway tokens,
   enforced **server-side in terminus** — no new signed claims, no control-plane minting, no
   `@open-inspect/shared` churn. Per-_identity_ policies arrive with multi-tenancy.
6. **Defense-in-depth vs the signed claim (Nejc).** The guardrail policy **stacks on** the signed
   `claims.allowed_models`, never widens it. Effective allow =
   `claims.allowed_models ∩ guardrails.allowedModels` minus denies. (With no `forceModel`, the
   requested model is unchanged, so both gates simply apply to it.)
7. **BYOK scope encoded now, dormant (Nejc).** `credentialScope` (`platform`|`byok`|`both`) +
   `byokServiceFeeBps` live in the **JSON blob** (not columns → migration-free,
   `schemaVersion`-gated) and are **validated + stored but read by no code in v1** (tenant claim
   null; no BYOK creds exist). They lock the shape early; enforcement lands with BYOK/multi-tenancy.
8. **Fallback = non-streaming only** in v1; streaming (peek-first-chunk) → **CON-74**.
9. **CON-70 now = platform ingestion/admin API + owner plumbing**; per-tenant writes/resolution
   deferred (AES-GCM AAD binds ciphertext to owner; tenant claim is null).
10. **Decision rule #7:** add a table/column **only if v1 code reads or writes it** for present
    value. (The versioned policy tables satisfy this via the admin API writer of decision 4. The
    dormant BYOK fields are exempt by living in the JSON blob, not columns.)

## 3b. Target architecture (identity + BYOK) — where PR2 fits

> Grounded by the OpenRouter / LiteLLM / Helicone research (2026-06-17). This is the **full
> vision**; PR2 builds the foundation (guardrails + versioned owner-scoped policy + admin API), and
> **BYOK enforcement lands with multi-tenancy** (the identity claim is null today). Captured here so
> the data model + seams are forward-compatible.

**The shape (OpenRouter's two-mode model — "use platform credits OR provide BYOK"):**

- **Identity → owner.** The gateway token carries an identity claim (`tenant`, **null today**). It
  resolves to an `owner = (owner_type, owner_id)`: `tenant=null → PLATFORM_OWNER {platform, ''}`
  (today); a real tenant → `{tenant, <id>}` (multi-tenancy). `owner` keys both credentials
  (`provider_credentials`, already) and policies (`policies`, PR2).
- **Top-level platform group = the policy + credentials attached to `PLATFORM_OWNER`** — _not_ a new
  entity (recommended). "Platform" is just the owner whose pool + policy define non-BYOK access +
  platform pricing; everyone falls back here unless _forced_ off it.
- **Two credential pools for an `(owner, provider, model)`:** the **BYOK pool**
  (`owner_type=tenant`, the caller's own keys) and the **platform pool** (`owner_type=platform`).
  L1's `orderCandidates` already orders _within_ a pool (priority tier → weighted shuffle → cooldown
  filter). The new piece is the **cross-pool edge**: BYOK pool first, then platform (the _unforced_
  fallback).
- **`forced` / `unforced` (per-BYOK-credential).** OpenRouter's "Always use for this provider";
  Helicone's per-key flag. **forced** = use only my key, hard-fail on exhaustion/error (no platform
  edge). **unforced** = try my key, then fall through to the platform pool. A **column on
  `provider_credentials`** authored by the key owner — **not** the policy blob — landing with the
  **BYOK PR** (no storage target now: no BYOK rows, and putting it in the dormant blob would force a
  premature precedence call vs `credentialScope`).
- **`credentialScope` (`platform` | `byok` | `both`) — org-level pool eligibility, in the policy
  blob.** Same axis as `forced`/`unforced` but at owner granularity; they **compose**: `byok` =
  forced-for-all (no platform edge); `platform` = no BYOK pool; `both` = BYOK-then-platform, where a
  per-key `forced` refines it (suppresses the platform edge for that one key). Encoded **now,
  dormant** (validated + stored, unread until BYOK).
- **Pricing.** Platform pool → Terminus's metered price (CON-54). BYOK pool → the caller's own
  provider bill + an optional gateway **service fee** (`byokServiceFeeBps`; OpenRouter charges 5%,
  waived under 1M req/mo). Dormant now (see open question 1).

**The invariant that ties it to "no black magic":** candidate assembly **never** appends a candidate
whose resolved model differs from the requested model. BYOK→platform fallback swaps the
owner/credential for the **same** model — structurally identical to L1's within-pool rotation,
extended across the owner boundary. (Caller-opt-in alternates — OpenRouter's `models` array /
`openrouter/auto`, LiteLLM aliases — and the old `forceModel`/routing-chain are **out**; the latter
permanently.) Encoded as a test in PR2 (the guardrail path) and re-asserted when BYOK fallback
lands.

**Open questions for the BYOK PR (recorded, not blocking PR2):**

1. **Service-fee home:** keep `byokServiceFeeBps` in the versioned policy blob (locked: encode now)
   or move to a separate billing/fee row? In-blob couples a fee change to a full policy-version bump
   - security review; a billing row decouples it. Dormant now, so non-urgent.
2. **Identity granularity:** the claim is only `tenant` (no user-vs-org split). If the vision needs
   per-_user_ **and** per-_org_ scoping, the signed claim needs a second id field — a
   `@open-inspect/shared` change, deferred to multi-tenancy (CON-52).
3. **Precedence:** org `credentialScope=both` vs a per-key `forced` — recommend per-key `forced`
   refines (suppresses the platform edge for that key only).
4. **Fallback order:** confirmed **BYOK-first, then platform** (unforced) — matches OpenRouter + the
   vision; resolves Helicone's self-contradicting docs.

## 4. Architecture — pool (L1) + guardrail policy (L2)

Two **persisted** layers: L1 (credential pool, shipped) and L2 (guardrail policy, PR2). L2 is a
**pre-resolve gate**, not a router: it filters/clamps the request, then hands the **unchanged**
model to L1's existing resolution.

```
        ┌──────── L2 guardrail policy (terminus-only, PR2) ──────────────────┐
request │ load active policy version → applyGuardrails(body.model, policy):   │ ← leaked-JWT safe
        │   gate model + provider (allow/deny) → 403                          │   (gate + clamp only,
        │   clamp max_output_tokens to cap (incl. when omitted)               │    NEVER rewrites the
        │ (absent policy → pass-through; configured-but-unloadable → 5xx)      │    requested model)
        └────────────────────────────────┬──────────────────────────────────┘
                                          ▼   (same model the caller asked for)
        ┌──────── signed claim gate (existing) ──────────────────────────────┐
        │ claims.allowed_models (coarse outer bound) → 403  [defense-in-depth] │
        └────────────────────────────────┬──────────────────────────────────┘
                                          ▼
        ┌──────── L1 credential pool (PR1, unchanged) ───────────────────────┐
        │ resolveModelRef → forModelCandidates → within (owner,provider):     │
        │ filter cooled-down → priority tier → weighted shuffle → ordered      │
        │ candidates; non-streaming fallback on retryable error               │
        └────────────────────────────────┬──────────────────────────────────┘
                                          ▼
                    buildLanguageModel → streamText/generateText → usage sink
```

L1 alone (PR1) delivers same-model rotation/rate-limit pools + intra-provider fallback. L2 (PR2)
adds the RBAC gate/clamp **in front of** resolution. The L1 candidate loop is **untouched** — L2
only decides whether the request is allowed and how its token limit is bounded.

## 5. Data model

### 5.1 `provider_credentials` changes (PR1 — shipped)

Added (all with safe defaults so existing single-key rows keep working):

| Column              | Type / default                    | Used by v1 for                                                         |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `label`             | `TEXT NOT NULL DEFAULT 'default'` | disambiguate multiple creds per `(owner,provider)`; part of new unique |
| `priority`          | `INTEGER NOT NULL DEFAULT 0`      | selection: higher = preferred tier (tried first)                       |
| `weight`            | `INTEGER NOT NULL DEFAULT 1`      | weighted-random pick within a priority tier (treated as ≥1)            |
| `cooldown_until_ms` | `INTEGER` (nullable, ms)          | skip candidate while `now < cooldown_until_ms`; set on retryable fail  |
| `failure_count`     | `INTEGER NOT NULL DEFAULT 0`      | escalating backoff; reset to 0 on success                              |

- Replaced `UNIQUE(owner_type, owner_id, provider)` →
  `UNIQUE(owner_type, owner_id, provider, label)`; both `onConflict` targets in `vault.ts` migrated.
  `CHECK` (owner isolation) kept.

### 5.2 `policies` + `policy_versions` (PR2)

Renamed from Helicone's `routers`/`router_config_versions` — there is no routing, so "router" is a
misnomer. Same versioned-storage shape, owner-scoped (mirrors `provider_credentials`):

```
policies
  id           TEXT PK
  owner_type   TEXT NOT NULL DEFAULT 'platform'   -- mirrors provider_credentials
  owner_id     TEXT NOT NULL DEFAULT ''
  name         TEXT NOT NULL                       -- e.g. 'platform-default'
  enabled      INTEGER (bool) NOT NULL DEFAULT true
  created_at / updated_at  INTEGER NOT NULL
  UNIQUE(owner_type, owner_id, name)
  CHECK(owner_type = 'platform' OR owner_id <> '')  -- owner isolation, mirrors provider_credentials

policy_versions
  id           TEXT PK
  policy_id    TEXT NOT NULL REFERENCES policies(id)
  version      INTEGER NOT NULL                    -- monotonic per policy (max(version)+1 at write)
  config       TEXT NOT NULL                       -- validated JSON guardrail blob (§6)
  is_active    INTEGER (bool) NOT NULL DEFAULT false
  created_at   INTEGER NOT NULL
  UNIQUE(policy_id, version)
  UNIQUE INDEX (policy_id) WHERE is_active = 1      -- exactly one active version per policy
```

Rollback = flip `is_active` to an older version (atomic — deactivate the current active + activate
the target in one `db.batch`, so the partial unique never transiently doubles up). v1 auto-seeds one
platform-default policy + an initial active version (from a Worker-secret/Terraform JSON, parsed +
validated at seed). Migration regenerated as **one clean file** (tables not deployed): edit
`schema.ts`, then
`rm -rf services/terminus/migrations && pnpm --filter @orthogonal/terminus db:generate`.

## 6. Guardrail-policy config blob (PR2)

Stored as `policy_versions.config` (validated JSON). v1 schema — **gate + clamp only, no routing, no
model rewriting**:

```jsonc
{
  "schemaVersion": 1,
  // RBAC guardrails — applied server-side regardless of client input (the leaked-JWT clamp).
  // ENFORCED in v1. Every gate is opt-in: null/absent = unrestricted (pass-through).
  "guardrails": {
    "allowedModels": null, // null = unrestricted; else hard allow-gate of full "provider/model" ids
    "deniedModels": [], // explicit deny-list (a deny always wins over an allow)
    "allowedProviders": null, // null = unrestricted; else hard allow-gate of provider ids
    "deniedProviders": [],
    "maxOutputTokensCap": null, // null = no cap; else clamp max_completion_tokens/max_tokens (incl. when omitted)
  },
  // Forward-compat, DORMANT in v1: validated + stored, read by NO code until BYOK/multi-tenancy.
  // In the JSON blob (not columns) → "encode now" is migration-free + schemaVersion-gated.
  "credentialScope": "platform", // platform | byok | both — which credential source a token may use
  "byokServiceFeeBps": null, // integer basis points; markup on BYOK usage (pricing model)
}
```

Validated by a **discriminated-union parser keyed on `schemaVersion`** at **write** (seed/admin) —
the stored blob shape is never trusted at read (it is re-validated on load and a parse/validation
failure of a _configured_ policy fails closed, see §9). Later versions can add fields under new
`schemaVersion`s without breaking the reader (which switches on `schemaVersion`).

**Enforcement (`applyGuardrails`, pure):**

- Operates on the **raw `body.model` string** via a **shared parse helper extracted from
  `resolveModelRef`** (split at the first `/`; `slash <= 0` or a trailing slash → **unparseable**).
  allow/deny **model** entries are full `"provider/model"` ids; allow/deny **provider** entries are
  provider ids. So `openrouter/anthropic/claude` → provider `openrouter`, exactly as resolution sees
  it — no split-mismatch bypass or phantom 403. An **unparseable** id (no valid split — e.g. a
  no-slash `"gpt5"`) **fails a non-null `allowedProviders` gate** (fail-closed: a naive
  `slice(0, indexOf("/"))` would return `-1`-sliced garbage and could dodge the gate); model-level
  gates apply to the literal id; when no provider allow-gate is set, an unparseable id passes
  guardrails and `resolveModelRef` then 404s it.
- Gate order: `deniedModels`/`deniedProviders` (deny wins) → `allowedModels`/`allowedProviders`
  (allow-gate if non-null). Any violation → **403**.
- Clamp: if `maxOutputTokensCap` is set, the effective `maxOutputTokens` =
  `min(requested ?? ∞, cap)` — i.e. it clamps **even when the client omitted the field** (never
  unbounded). Returns the effective value for `chat.ts` to thread into the call.
- **Never mutates `body.model`.** No `forceModel`. The resolved + served model is always the
  requested one.

**Interaction with `claims.allowed_models` (defense-in-depth):** the signed claim is a coarse outer
bound; `guardrails.allowedModels` is the platform policy gate. Both apply to the (unchanged)
requested model; effective allow = their intersection minus denies. Neither widens the other.

**`forced`/`unforced` is intentionally _absent_ from the blob.** It is a per-credential concern (the
key owner's choice), so it lands as a **column on `provider_credentials`** with the BYOK PR (§3b) —
not policy config. `credentialScope` (here, dormant) is its owner-granularity counterpart; the two
compose (§3b) but are stored at different levels.

## 7. Components (one purpose each)

**PR1 (CON-70 + CON-71 L1) — shipped.** `db/schema.ts` pool columns; `credentials/selection.ts`
(`orderCandidates`); `db/vault.ts` candidate read/decrypt + health writers + admin CRUD +
`listCodexRowsNearExpiry`; `credentials/provider.ts` `forModelCandidates`; `credentials/retry.ts`
classification + cooldown; `routes/chat.ts` non-streaming fallback loop; `routes/admin.ts`
`/admin/credentials`; `credentials/codex-manager.ts` cron-iterate-all; `env.ts`
`TERMINUS_ADMIN_SECRET`. (See §11b.)

**PR2 (CON-71 L2 — guardrails):**

- `policy/blob.ts` _(new, pure)_ — `GuardrailPolicy` types + `parsePolicy(raw): GuardrailPolicy`
  (discriminated-union validator keyed on `schemaVersion`; throws on bad shape; applies the
  null/`[]` defaults). The one place the blob shape is defined + validated (write **and** read).
- `policy/guardrails.ts` _(new, pure)_ —
  `applyGuardrails(modelId, policy): { maxOutputTokens?: number }`: gate model + provider (§6) →
  throws `GatewayError(403)`; returns the clamped `maxOutputTokens`. Shares the provider-split
  helper with `resolveModelRef`.
- `policy/store.ts` _(new)_ — `PolicyStore`:
  - `getActivePolicy(owner): Promise<GuardrailPolicy | null>` — reads the active `policy_versions`
    row for the owner's policy (cheap, no decrypt; the blob isn't secret), caches the **parsed**
    blob in-isolate keyed by `(policyId, version)`. Returns `null` **only** when nothing is
    configured (no policy row **and** no seed secret) → pass-through. Lazy-seeds policy + version 1
    from `TERMINUS_GATEWAY_POLICY` (insert-if-absent, validated at parse) so a Terraform baseline
    coexists with admin writes. To keep the default (no-policy) path **off a per-request D1 read**,
    the active-policy lookup is cached **module-level (in-isolate) with a short TTL — including the
    `null` "none configured" result** (policies change rarely, via seed/admin; a few seconds of
    staleness is fine). The cache is injectable for tests. (Gating on seed-secret presence is
    **rejected**: an admin-API-created policy with no seed secret must still be enforced.)
    **Fail-closed:** a D1 error, or a configured policy whose blob fails parse/validation, **throws
    `policyUnavailable()` (503)** — never silently passes through.
  - admin ops (Drizzle, parameterized): `createPolicy` / `createVersion(config, activate?)`
    (validate → `max(version)+1`) / `setActiveVersion(policyId, version)` (atomic `db.batch`
    deactivate+activate) / `listPolicies` / `listVersions`.
- `routes/chat.ts` — before `resolveModelRef`: `const policy = await store.getActivePolicy(owner)`;
  if non-null, `const { maxOutputTokens } = applyGuardrails(body.model, policy)` (403 on gate);
  thread the clamped `maxOutputTokens` into the existing `callOptionsFor`. The existing signed-claim
  gate + the entire L1 candidate/fallback loop are **unchanged**. (Order: policy gate → signed-claim
  gate → `resolveModelRef` → candidates, so 403 precedes 404 and denied models don't reveal
  existence.)
- `routes/admin.ts` — add policy endpoints under the existing `/admin` app (same
  `TERMINUS_ADMIN_SECRET` bearer): `POST /admin/policies` `{name?}`, `GET /admin/policies`,
  `POST /admin/policies/:id/versions` `{config, activate?}` (validate via `policy/blob.ts`),
  `GET /admin/policies/:id/versions`, `PATCH /admin/policies/:id/versions/:version`
  `{isActive:true}` (activate/rollback). Thin HTTP; all DB + validation in `policy/store.ts` +
  `policy/blob.ts`.
- `index.ts` — per-request `PolicyStore`; thread into `chat`; mount the policy admin routes.
  (Catalog owner-threading stays deferred — tenant null; no present value.)
- `env.ts` + Terraform — `TERMINUS_GATEWAY_POLICY` seed secret; `policies`/`policy_versions`
  migration (regen, one clean file until first deploy).

## 8. Request flow (PR2, end state)

```
verify token
  → policy = PolicyStore.getActivePolicy(owner)      # null = absent → pass-through;
                                                     #   throw = configured-but-unloadable → 5xx (fail-closed)
  → if policy: applyGuardrails(body.model, policy)    # gate model + provider → 403; clamp max tokens (incl. omitted)
  → claims.allowed_models gate                        # signed coarse bound, defense-in-depth → 403
  → resolveModelRef(body.model)                       # 404 unknown (after the 403 gates)
  → forModelCandidates(ref, owner) → orderCandidates  # L1 pool (UNCHANGED)
  → non-streaming fallback loop over candidates:      # (UNCHANGED); streaming = single candidate (CON-74)
        decryptById → buildLanguageModel → generateText (maxRetries:0, clamped maxOutputTokens)
        success → recordSuccess, emit usage, return
        retryable failure → recordFailure(cooldown), next candidate
  → all exhausted → deterministic gateway error (502 / 503 all-cooled-down)
```

The model served is **always** the model requested (or a clean 403/404) — never substituted.

## 9. Error handling / invariants (must preserve)

- **No model substitution (candidate-assembly invariant):** guardrails only gate (403) or clamp
  output tokens; they never rewrite `body.model`. More generally, candidate assembly **never**
  yields a candidate whose resolved model differs from the requested model — today trivially (one
  `ref`), and when BYOK fallback lands the BYOK→platform edge swaps only owner/credential, never the
  model. The served model equals the requested model. (Tested in PR2.)
- **Fail-closed (policy):** policy **absent** (no row + no seed secret) → pass-through (additive
  default, gateway ships OFF). Policy **configured-but-unloadable** (D1 error, or a stored/seed blob
  that fails parse/validation) → **reject via an explicit `policyUnavailable()` (503)** GatewayError
  — _not_ the generic 502 `toGatewayError` catch, so the code produces the status the spec promises;
  never silent pass-through. (Availability cost ≈ nil: if D1 is down, credential resolution already
  fails the request, so fail-closed here adds no new outage surface while keeping the RBAC boundary
  intact when it matters.)
- **Fail-closed (request):** unknown model 404, guardrail/claim violation 403, unsupported adapter
  501, all candidates exhausted → 502 (all cooled-down → 503).
- **Provider-split parity:** `applyGuardrails` splits `provider/model` identically to
  `resolveModelRef` (first `/`). A divergence is a gate bypass or phantom 403 — covered by a test.
- **AES-GCM AAD per owner:** decrypt each candidate with its exact owner AAD; never widen AAD for
  cross-owner reads. (The policy blob is **not** encrypted — it is not a secret.)
- **In-isolate only:** decrypted secrets + the parsed-policy cache live in-isolate, never KV. The
  policy cache keys by `(policyId, version)` and holds no plaintext secret.
- **Dormant BYOK fields:** `credentialScope` / `byokServiceFeeBps` are validated + stored but read
  by no v1 code (they live in the JSON blob, not columns). Do not branch on them in v1.
- **Best-effort writes:** `recordFailure`/`recordSuccess` and usage emit must **never** fail a good
  completion (catch+log, off the hot path via `waitUntil`).
- **Versioning integrity:** exactly one active version per policy (partial unique); activation is an
  atomic `db.batch`. Seeding stays insert-if-absent (idempotent; never clobbers an admin-written
  version).
- **Drizzle parameterized only** — no raw SQL, incl. the new policy queries.

## 10. Phasing & PRs (both base `terminus`)

- **PR1 — CON-70 + CON-71 L1 (landed).** §5.1 migration + `selection.ts` + vault candidate
  selector/recorders + admin ingestion API + owner plumbing + non-streaming fallback + Codex
  cron-iterate-all. Closes **CON-70**; advances **CON-71**. (See §11b.)
- **PR2 — CON-71 L2 (guardrails).** §5.2 tables + §6 guardrail blob +
  `policy/{blob,guardrails, store}.ts` + `chat.ts` enforcement + policy admin API. Focused
  **security review** (leaked-JWT clamp; fail-closed; provider-split parity; defense-in-depth vs the
  signed claim). Closes **CON-71**.
- **Future — BYOK PR (gated on multi-tenancy / a non-null identity claim).** Per §3b: a
  `forced`/`unforced` column on `provider_credentials`; per-tenant owner derivation in
  `forModelCandidates` (today hard-pinned to `PLATFORM_OWNER`); the BYOK→platform fallback edge
  (BYOK-first, unforced); reading `credentialScope` to gate pool eligibility; service-fee accounting
  (with CON-54). Re-asserts the no-substitution invariant across the owner boundary.
- **Deferred (explicit):** model rerouting / `forceModel` / cross-provider fallback (across
  _different_ models) — **out of scope by decision** (decisions 1 + §3b), not merely later;
  node-graph schema/interpreter + node-builder UI → dashboard; per-identity policy binding +
  BYOK-scope/service-fee **enforcement** → multi-tenancy; streaming fallback → **CON-74**.

## 11. Test strategy (TDD — test first, watch it fail)

**Unit (node, `src/**/\*.test.ts`):\*\*

PR1 (shipped): `selection.ts` (cooled-down exclusion; priority tiers; weighted-shuffle determinism
under injected RNG; single-row back-comp); retry classification (429/5xx/network retryable; 400/401
terminal); `chat.ts` fallback loop.

PR2:

- `policy/blob.ts`: validator **rejects** bad shapes (wrong/missing `schemaVersion`, non-array
  deny-lists, bad `credentialScope` enum, non-integer `maxOutputTokensCap`/`byokServiceFeeBps`);
  **accepts** a valid blob and applies null/`[]` defaults; round-trips the dormant fields.
- `policy/guardrails.ts`: allow/deny **model** gates; allow/deny **provider** gates; provider-split
  parity for nested ids (`openrouter/anthropic/claude`); cap clamps when requested > cap **and**
  when omitted; no cap → returns requested unchanged; **leaked-token requesting a denied model →
  403** (the security case).
- `chat.ts` (injected fake `CredentialProvider` + `PolicyStore`): guardrail 403 short-circuits
  **before** resolve/candidate read; **pass-through when policy is null** (no gating/clamp);
  **fail-closed when the store throws** (5xx, not pass-through); clamped `maxOutputTokens` is
  threaded into the model call.

**D1 integration (Miniflare, `test/integration/`):**

- Clean migration applies (regened file: `policies` + `policy_versions`).
- Seed from `TERMINUS_GATEWAY_POLICY` → active-version lookup returns the parsed policy; in-isolate
  cache hit on the second read.
- Admin: `create policy` → `create version` → `activate` → `list`; **rollback** (activate an older
  version, exactly one active); unauthorized → 401; owner-scoping.
- End-to-end: a policy that **denies** a model → `POST /v1/chat/completions` for it → 403; an
  **allowed** model → served (model unchanged). Dormant fields stored + round-tripped, **not**
  enforced.

**Gate before "done"** (per repo rules): `pnpm --filter @open-inspect/shared build` →
`pnpm --filter @orthogonal/terminus typecheck && test && test:integration` → `pnpm fmt:check` →
`pnpm lint` → `tofu fmt -check` for any `.tf`. Advisor before declaring done.

## 11b. Implementation status

**PR1 landed (2026-06-17)** on `nejc/con-71-con-70-gateway-routing-byok` (merged to `terminus` via
PR #14), TDD, all green: **109 unit + 37 D1-integration** tests. Shipped: pool columns + label-keyed
unique (one clean migration); `orderCandidates`; vault candidate read/decrypt + health writers +
admin CRUD + codex-near-expiry; retry/cooldown classification; `forModelCandidates` + non-streaming
fallback (`maxRetries:0` on that path only); codex cron refreshes every owner; `/admin/credentials`
ingestion API (+ `TERMINUS_ADMIN_SECRET`). The all-cooled-down → 503 follow-up also shipped.

**Deferred (no present value in v1):** catalog owner-threading (tenant null); codex pool health
(synthetic-id no-op — needs multi-account codex); health-write race (needs a versioned/conditional
update). Tracked in CON-71 comments.

**PR2 (this branch `nejc/con-71-policy-guardrails`)** = CON-71 L2 guardrails, per §§4–11 above.

## 12. Open / to confirm at PR2 review

- **Table naming:** `policies` / `policy_versions` (dropped the misleading `router*` since there is
  no routing). Confirm at review.
- **Seed secret name:** `TERMINUS_GATEWAY_POLICY` (JSON guardrail blob, validated at seed). Confirm.
- **5xx code for policy-load failure:** transient (D1) vs config (bad stored blob) — both
  fail-closed; start with 503 (transient/retryable framing) and revisit if a distinct config-error
  code is wanted.
- **Admin policy API surface** (REST paths in §7) finalized in PR2 implementation.
