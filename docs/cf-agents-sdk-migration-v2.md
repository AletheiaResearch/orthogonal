# CF Agents SDK migration — v2: rewrite plan, Drizzle, multi-tenancy, usage metering, OpenCode agents & commands

**Status:** Research + planning only. Builds **on** `docs/cf-agents-sdk-migration.md` (v1) — it is
not re-derived here. v1's verified topology (two inbound WS legs A/B), the bridge analysis (§4), the
§9 decisions (D0–D4), and the multi-tenant seams (§6) are taken as settled inputs. This v2
integrates five research dossiers (Drizzle/ORM surface, OpenCode agents, OpenCode commands,
token-usage metering, multi-tenancy, UI surface) and expands the plan to cover the rewrite
reframing, Drizzle, tenancy, metering, and OpenCode agents/commands.

> **⚠️ GATEWAY IS PROPOSED, NOT DECIDED.** This v2 leans heavily on an **LLM-gateway Worker** (a new
> stateless Worker fronting all provider traffic — the auth/metering/BYOK/per-tenant-catalog hub).
> **It does not exist in the durable decision record:** v1's decisions are D0–D4 only, there is no
> ADR for it (`docs/adr/0001`, `0002` cover other matters), and `src/auth` has only a generic
> `mintJwt` helper — nothing wiring it to a gateway, no `/v1/models`, no `allowed-models`/`tenant`
> JWT claim, no BYOK design. **It is therefore a new human-owned fork (`D-gateway`, §9), not "prior
> context."** Every gateway-dependent phase (G, Me) and the entire metering / BYOK /
> per-tenant-catalog cluster is **explicitly conditional on `D-gateway`**, exactly as the [SDK]
> phases are conditional on the Phase-1a gate. Where the gateway is mentioned below it is flagged
> **[PROPOSED — pending D-gateway]**.

**Citation convention (carried from v1 and the dossiers):** **FACT** = verified at `file:line`.
**ASSUMPTION** = inference, confidence noted. **DOC** = stated in vendor docs (Cloudflare /
OpenCode). **C7** = OpenCode source via context7 `/anomalyco/opencode` (implementation, lower
confidence than docs). **UNCERTAIN** = single-source / not pinned / product choice. Any code is a
clearly-labeled **illustrative sketch**, not a final API. Version-sensitive SDK/ORM/OpenCode
signatures must be **re-pinned and re-verified at implementation time** against the installed
version (the repo's 7-day `minimumReleaseAge` gate, `pnpm-workspace.yaml minimumReleaseAge: 10080`,
governs which versions are installable).

**Verify-at-implementation list (load-bearing, unverified — gate the dependent work on these):**

- **Token object shape** — whether `step-finish` emits
  `{total,input,output,reasoning,cache:{write,read}}` (third-party-sourced) vs a scalar (the only
  repo fixture asserts `tokens == 150`; wire type is `tokens?: number`, `index.ts:231`). Verify
  against the pinned OpenCode version in a real sandbox **before persisting token columns** (§3.1,
  Phase M-near, D6-B).
- **`message_id` gateway observability** — whether OpenCode's internal `message_id` appears in the
  upstream provider request the gateway proxies. The gateway's trusted JWT keys are
  `tenant`/`sid`/`model` only; `message_id` is **not** known to be observable gateway-side. The
  `(session_id, message_id)` reconciliation join (§3.2/§3.3, Phase Me, D6-A, D14) depends on it.
- **`.well-known/opencode` auth headers** — whether OpenCode fetches `.well-known/opencode` remote
  config with custom auth headers (§5.2, D12). If not, per-tenant remote config is unworkable and
  `OPENCODE_CONFIG_CONTENT` is the default.
- **Drizzle journal-table name + `durable-sqlite` driver maturity** — exact `__drizzle_migrations`
  name across versions; `drizzle-orm/durable-sqlite` is less battle-tested than the d1 driver (§2).
- **SDK signatures** — per v1 §8 (second-peer connection-set semantics, `setState` exclusion,
  `compatibility_date` bump).

**Two naming traps enforced throughout (do not conflate):**

- **"`SessionAgent`"** = the Cloudflare Agents SDK DO class (`DurableObject → Server → Agent`).
  **"OpenCode agent"** = a model+prompt+tools profile _inside the Modal sandbox_. These are
  unrelated; keep the terms distinct in code and docs.
- **`participants.role` = `owner | member`** (per-session DO; `shared/types:43`,
  `session/schema.ts:43`) ≠ **`tenant_memberships.role` = `admin | member`** (per-org, new). A
  tenant `member` is still the session-`owner` of their own sessions.

---

## 1. Re-analysis of the v1 plan — what holds, what changes

### 1.1 What holds unchanged

- **The verified topology (v1 §2, §4.1).** Two inbound WS legs to the per-session DO — leg A
  (browser) and leg B (Modal sandbox dials in `?type=sandbox`); CP→Modal is one-shot HTTP
  (`client.ts:246`). FACT, unchanged.
- **D0 — spike first.** Phase 0 (naming/tenant seams, no SDK) + Phase 1a (no-traffic `SessionAgent`
  proving the second-peer MUST-VERIFY, v1 §4.3b). **This gate stays first and intact.** Everything
  in this v2 downstream of the gate is explicitly conditional on 1a green-lighting.
- **D2 — leg-B auth stays hand-rolled inside the Agent.** Verified: `routeAgentRequest`'s
  `onBeforeConnect` runs at the Worker routing layer with `(request, lobby)` only — no per-DO
  `this.sql` access, so it cannot run `getSandbox()`/`isValidSandboxToken` (v1 §4.3a VERIFIED note).
  Unchanged. **A gateway token (if D-gateway is approved) would change what the sandbox _carries_,
  not how leg B _authenticates to the DO_.**
- **D3 — defer the tenant key; bare DO names + nullable D1 `tenant_id`.** A DO name is permanent;
  ownership today is actually `user_id`, `repo_owner` is only a proto-tenant. This v2 **honors D3
  everywhere** — the new dossier's "`installation_id` is the principled org seam" is presented as
  the _leading candidate for when we flip_, never a now-commitment (§4, §8).
- **D4 — `this.sql`/`SessionRepository` is the system of record, not the `setState` blob.** The
  metering, tenancy, and agent work in this v2 all key off relational columns and the D1
  write-through, reinforcing D4.

### 1.2 What changes now: the rewrite (D1) reframes the phases

v1 §9 **DECIDED D1 → Option B: the eventual full port is a ground-up REWRITE**, overriding v1's own
original recommendation of an incremental adapter. This is the single most important reframe, and it
has three consequences this v2 builds on:

1. **The rewrite is the natural home for new structure.** Because the `SessionAgent` store is
   green-field (v1 Phase 3: **no DO→Agent data carryover**; every `SessionAgent` starts on empty
   SQLite — FACT), the rewrite is the cheapest moment to adopt **Drizzle for the DO store** (§2) and
   to thread tenancy/metering seams cleanly rather than retrofitting 31 migrations and ~4,500 LOC of
   hand-rolled SQL (`cb-db-orm`: `db/*.ts` ~2,600 LOC, `session/repository.ts` 927,
   `session/schema.ts` 445). The green-field discount removes the **31-migration-replay** cost; it
   does **not** make the query-layer re-expression free (§2.2 — MEDIUM effort/risk).
2. **The rewrite _raises_ regression risk** (v1 §9-D1 note: ack/buffer/replay, circuit breakers,
   child lineage, execution-timeout reconcile get re-expressed, not lifted). The `test/integration`
   suite + shadow-parity checks against the `SessionDO` baseline become the load-bearing safety net.
   Adding Drizzle, tenancy, and metering to the rewrite **does not relax** that — it widens the
   surface that must be validated against baseline.
3. **The spike itself ports no domain logic.** Phase 0 + 1a remain exactly as v1 specifies. The
   rewrite governs the _later_ full implementation _if_ the spike green-lights. So this v2's new
   workstreams (gateway, Drizzle, tenancy, metering, OpenCode agents/commands, UI) attach **after**
   the gate, and several are **orthogonal** to it (they touch sandbox-runtime + wire protocol + UI,
   not the second-peer question — see §8).

### 1.3 The new dimension: this is no longer "just a session-layer migration"

v1 was scoped to the per-session DO + sync + bridge. This v2 adds four cross-cutting workstreams
that the original scope did not contain:

| New workstream                                                           | Touches                                                                                               | Coupled to the SDK migration?                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM gateway + token auth redesign** **[PROPOSED — pending D-gateway]** | sandbox token, OpenCode config plugin, a new stateless Worker                                         | **No** to the second-peer question — but **not yet decided to exist at all.** If approved, it is the prerequisite _hub_ for metering, BYOK, and per-tenant catalogs; if deferred/declined, those clusters fall back to status-quo (sandbox-reported) paths. See `D-gateway` (§9). |
| **Drizzle** (this v2 §2)                                                 | `SessionAgent` store (rewrite) + optionally D1                                                        | DO store: **yes**, inside the rewrite (MEDIUM effort/risk). D1: **no**, independent cleanup.                                                                                                                                                                                      |
| **Multi-tenancy + RBAC** (§4)                                            | D1 schema, internal token claims, authorization in CP (+ gateway token claim _if_ D-gateway approved) | MT-0 seams **fold into v1 Phase 0**; the _flip_ is a later deliberate phase.                                                                                                                                                                                                      |
| **Usage metering** (§3)                                                  | gateway (if approved), bridge event widening, D1, admin API/UI                                        | **No** to the SDK; the **near-term** token-visibility win needs no SDK change _and no gateway_ (status-quo path). The **authoritative-meter** half is **[PROPOSED — pending D-gateway]**.                                                                                         |
| **OpenCode agents + commands** (§5, §6)                                  | sandbox-runtime (`entrypoint.py`, `bridge.py`), wire protocol, UI                                     | **No** — orthogonal; can land before/during/after the spike.                                                                                                                                                                                                                      |

**The reframed shape:** the SDK migration (spike → rewrite of the session layer) is **one track**;
an LLM gateway/auth redesign — **if `D-gateway` is approved** — would become the **prerequisite
hub** for a second cluster (metering, BYOK, per-tenant OpenCode config); tenancy threads through
both; OpenCode agents/commands + UI ride mostly on the sandbox-runtime/wire-protocol track. §8
sequences these with explicit dependencies and parallelism, and marks the gateway-dependent phases
conditional on `D-gateway`.

---

## 2. Drizzle decision

**The two dossiers appear to disagree but reconcile cleanly once you separate technical risk from
sequencing priority.** `cb-db-orm` headlines "Drizzle for D1 only — best ROI, recommendable scope."
`research:drizzle` headlines "DO store in the rewrite only; defer D1, keep it off the critical
path." Both are right about different things: **D1 is technically low-risk** (mature
`drizzle-orm/d1` driver, simple tables) **but should be deferred in sequence**; **the DO store is
the highest-value adoption** _because_ it rides the already-decided rewrite — but it is **MEDIUM
effort / MEDIUM risk**, not free (`cb-db-orm` §5(b)): the green-field discount removes the
31-migration replay, but the ~62 `sql.exec` sites, the keyset-cursor pagination (`queryEventPage`),
and the `ON CONFLICT` upserts are a genuine re-expression that must be parity-checked against the
`SessionDO` baseline, and `drizzle-orm/durable-sqlite` is less battle-tested than the d1 driver. The
migration-tooling collision is what makes "D1 as migrator" a no — it is the spine of this section.

### 2.1 The four-way migration-tooling collision (the load-bearing analysis)

There are **four distinct schema/migration authorities** in play, and the central fact is that
**drizzle-kit's runtime migrator fights three of them**:

| Authority                 | Format / ledger                                                                                                                                                                                                                                                                                                            | Applier                                                                                                                                                                               | Scope                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Terraform D1 pipeline** | `NNNN_*.sql` files; custom `_schema_migrations(version TEXT PRIMARY KEY, name, applied_at)` — _filename-based string version_                                                                                                                                                                                              | `scripts/d1-migrate.sh` via `wrangler d1 execute --remote --file`, driven by `null_resource.d1_migrations` keyed on a directory SHA (`terraform/environments/production/d1.tf:14-40`) | Global D1 index (23 migrations)                  |
| **DO in-code ledger**     | `MIGRATIONS: readonly SchemaMigration[]` (31 entries), `_schema_migrations(id INTEGER PRIMARY KEY, applied_at)` — _integer id_; runs every cold start; swallows duplicate-column errors; includes JS-function migrations (renames/drops, ids 7/20/23/24/28/29) (`session/schema.ts:160-391`, `applyMigrations` `:414-437`) | `initSchema(this.sql)` in the DO                                                                                                                                                      | Per-session DO SQLite                            |
| **drizzle-kit**           | `0000_name/migration.sql` folders + `_journal.json`; applied state in `__drizzle_migrations` _hash table_                                                                                                                                                                                                                  | `drizzle-kit migrate`/`push` (runtime) **or** `migrate(db, bundledMigrations)` for DO                                                                                                 | Whatever it owns                                 |
| **Agents SDK**            | reserved `cf_agents_state`, `cf_agents_schedules` — SDK migrates these itself                                                                                                                                                                                                                                              | the SDK, inside the Agent                                                                                                                                                             | Same per-`SessionAgent` SQLite as our app tables |

**Collision points (FACT/DOC):**

- drizzle-kit's `0000_name/` + `__drizzle_migrations` format **does not match** the bespoke
  `NNNN_*.sql` + `_schema_migrations(version TEXT)` convention. Running `drizzle-kit migrate`/`push`
  at runtime would **fight the Terraform pipeline** (`research:drizzle` §2.1). The two
  `_schema_migrations` tables already have **incompatible schemas** (`version TEXT` in D1 vs
  `id INTEGER` in the DO) — they never share a DB so it's fine today, but any tool assuming one
  shape breaks on the other (`cb-db-orm` §1).
- In the `SessionAgent` SQLite, drizzle's `migrate()` creates **its own** journal table (likely
  `__drizzle_migrations`; **UNCERTAIN exact name** — pin at impl), which becomes a **third migration
  authority alongside the SDK's `cf_agents_*`** on the same database. They don't bookkeep each
  other's tables (separate namespaces: app tables unprefixed, drizzle journal `__drizzle_*`, SDK
  `cf_agents_*`) — so coexistence is fine **if** scoped strictly to app tables and the SDK is never
  told about `cf_agents_*`. **This coexistence check belongs in Phase 1b (the rewrite proper), not
  the Phase 1a gate** (§2.2, Phase 1a).

### 2.2 Recommendation (pending D5)

> **RECOMMENDATION (this v2, pending D5 in §9): Adopt Drizzle for the `SessionAgent` DO store — but
> only inside the ground-up rewrite (D1 = Option B). Defer D1 as a separate, lower-priority,
> query-layer-only cleanup; never make drizzle-kit the D1 runtime migrator. There is no single
> schema source of truth across D1 + DO.** _(This is the body's recommendation; the actual go/no-go
> is the human's at D5 — the body does not pre-decide the fork.)_
>
> **Driving constraint:** the decided green-field rewrite makes DO-store Drizzle adoption _the
> cheapest moment to do it and the most valuable_ (it removes the 31-migration-replay cost and is
> cheaper than retrofitting a working system), **but it is still a MEDIUM effort / MEDIUM
> re-expression** (62 query sites + keyset pagination + upserts, parity-checked vs `SessionDO`); the
> bespoke Terraform/`_schema_migrations(version TEXT)` convention makes D1-as-migrator a fight not
> worth picking.

**Per-surface detail:**

- **`SessionAgent` DO store → adopt Drizzle, in the rewrite (primary, recommended; MEDIUM
  effort/risk).** Because there is **no DO→Agent carryover** (v1 Phase 3, FACT), Drizzle does
  **not** replay the 31 historical `ALTER`s — it **baselines the current effective schema**
  (`SCHEMA_SQL`, already the post-migration shape, `schema.ts:8-131`) as drizzle migration `0001`.
  The 31-step ledger and the parallel hand-typed row interfaces (`SessionRow`/`SandboxRow` in
  `session/types.ts:21-115`, plus the second drifting `SessionRow` in `db/session-index.ts`)
  collapse into **one typed `schema.ts`**. `migrate(this.db, migrations)` inside
  `blockConcurrencyWhile` replaces `applyMigrations()` and is the idiomatic ordering guard. **This
  work lands in Phase 1b (the rewrite), NOT in the Phase-1a gate** — 1a stays Drizzle-free (v1's
  `initSchema()` spike) so the second-peer stop/go signal carries zero domain logic. In 1b: swap
  `initSchema()` → `migrate(this.db, migrations)`; assert the drizzle journal table name in the same
  `SELECT name FROM sqlite_master` `cf_agents_*` collision check; restate "deterministic regardless
  of whether the SDK creates `cf_agents_*` or `migrate()` runs first." The driver consumes the
  `DurableObjectStorage` object (`drizzle(this.ctx.storage)`), _not_ `this.sql` — it sits _beside_
  the SDK on the same SQLite (DOC/C7). Highest type-safety payoff (closes the unchecked `as T[]`
  casts at `repository.ts:247`, the manual `?1:0` boolean and ad-hoc JSON parsing, the
  stringly-typed `set`/`where` builders); the cost is the MEDIUM re-expression of the query layer +
  parity checks, not zero.

- **D1 global index → defer; if ever done, query-layer-only with Terraform staying the applier.**
  Working system, not being rewritten; retrofitting 14 stores / 23 migrations is regression risk
  with no green-field discount. If pursued later: define the schema in Drizzle TS as a _typed query
  layer_, keep `terraform/d1/migrations/*.sql` + `scripts/d1-migrate.sh` as the source of truth and
  applier, use `drizzle-kit` for nothing (or only `pull`-introspection sanity checks) — **never**
  runtime `migrate`/`push`. **Must verify** `drizzle(instrumentD1(env.DB, metrics))` preserves the
  instrumentation wrapper (`db/instrumented-d1.ts`, `router.ts:351`) — drizzle's d1 driver calls
  `prepare/bind/all/run/batch`, which the wrapper times, so it _should_ pass through, but confirm
  metrics don't silently go to zero (the wrapper's `exec/dump` are pass-through,
  `instrumented-d1.ts:220-226`). Leave `analytics-store.ts`'s dynamic
  `CASE WHEN`/`GROUP BY`/`COALESCE` aggregations as raw `sql\`...\`` escapes — an ORM helps least
  there.

- **One schema across both → not achievable.** drizzle-kit is one-config-per-database (DOC). D1
  (`d1-http`) and DO (`durable-sqlite`) need separate `drizzle.config.ts`, schema files, and `out`
  dirs. Share TS column-builder/type helpers only; do not overclaim unification.

**Pin `drizzle-orm` _and_ `drizzle-kit` at implementation time** (7-day `minimumReleaseAge`;
**UNCERTAIN** journal-table name across versions). **Do not retrofit the legacy `SessionDO`**
(throwaway under the rewrite), **do not put D1 on the spike critical path**, and **do not couple the
Drizzle adoption into the Phase 1a gate** (§4, Phase 1a/1b).

---

## 3. Token-usage metering for multi-tenant admins

> **[PROPOSED — pending D-gateway]** The "authoritative meter" in this section is the LLM gateway,
> which is **not yet a decided component** (§9 `D-gateway`). The **near-term token-visibility win
> (§3.1) is independent of the gateway** and needs no new infra. Everything keyed on the gateway
> (the authoritative ledger, budgets, pre-flight enforcement) is conditional on `D-gateway`.

### 3.1 Two facts that frame everything (one near-term path, one design-level — and one shape to verify)

- **Near-term win, mostly FACT but with an UNVERIFIED object shape:** OpenCode's `step-finish` part
  carries token usage plus a separate `cost` float. The bridge already holds the usage payload:
  `part.get("tokens")` is forwarded **untouched** at `bridge.py:777-784` and `:1022-1031`
  (**FACT**). The control plane then **discards it** — `sandbox-events.ts:125-137` reads **only**
  `event.cost` (calls `addSessionCost`), never `event.tokens`; `step_finish` is **not even persisted
  as an event** (**FACT**). However, the **structured shape**
  `{total, input, output, reasoning, cache:{write, read}}` is **DOC/UNCERTAIN, not FACT**: its
  evidence in `cb-token-usage` is third-party sources (TrueFoundry blog, opencode-tokenscope, a
  deep-dive post) with **no `file:line`**, and it is **contradicted by the only repo artifacts** —
  `test_bridge_message_tracking.py` asserts `tokens == 150` (a **scalar**) and the wire type is
  `tokens?: number` (`shared/src/types/index.ts:231`). So the type is not merely
  "inaccurate-but-unread"; **we do not actually know whether the runtime value is an object or a
  scalar on the pinned version.** **Therefore the near-term widening is CONDITIONAL:** verify the
  emitted shape against the pinned OpenCode version **in a real sandbox** before persisting token
  columns (Phase M-near). If it is an object, widen `step_finish`, persist it, add per-direction
  token columns to D1; if it is a scalar, persist the scalar and obtain per-direction tokens from
  the gateway instead (if `D-gateway` lands). This is **not** "verified, available today."
- **DESIGN-level [PROPOSED — pending D-gateway] (the authoritative meter):** an LLM gateway
  (stateless Worker, optionally fronting Cloudflare AI Gateway) _would be_ the right long-term
  system of record **if introduced** — it sees the raw provider request/response (unambiguous
  input/output/cache/reasoning tokens regardless of what OpenCode emits), holds the trusted
  attribution keys from the JWT it verifies (`tenant`, `sid`, resolved `model` alias→upstream), is
  the pricing source going forward, and is the **only place budget enforcement can live**
  (pre-flight reject before the upstream call). **But the gateway is not decided (`D-gateway`), and
  even if built, its ability to attribute at the per-message level is UNVERIFIED — see §3.2.**

### 3.2 The genuine fork (Section 9 carries it): durable meter = gateway vs sandbox-reported

This is the real decision (§9 `D6`). It is downstream of `D-gateway`: one branch (**D6-B**) is the
status quo with no new infra; the other (**D6-A**) requires building the gateway. Today cost is
computed _inside OpenCode_ from its own models.dev pricing tables (there is **no pricing table
anywhere in this repo** — `shared/src/models.ts` is a catalog with no pricing fields), and the CP
merely _sums_ those pre-computed floats into `sessions.total_cost`. If both a gateway ledger and the
sandbox ticker exist, they must never be summed (double-counting).

**Recommendation (dual-source reconciliation) — CONTINGENT on `D-gateway` AND on `message_id`
observability:**

- **Gateway = authoritative** for tokens, cost, budgets, billing. One immutable ledger row per
  inference call. _(Only if `D-gateway` is approved.)_
- **Demote `step_finish.cost` to a live in-session ticker only** — keep it for real-time UI
  responsiveness (it arrives on the existing leg-B WS with zero new infra), but reconcile/replace
  with gateway records.
- **⚠️ Reconciliation key is UNVERIFIED and load-bearing.** The intended join is
  `(session_id, message_id)`. But the gateway's trusted JWT keys are **`tenant`/`sid`/resolved
  `model` only**; `message_id` is **OpenCode-internal**, assigned at runtime inside the sandbox, and
  **it is NOT established that `message_id` appears in the upstream provider request the gateway
  proxies**. If the gateway cannot observe `message_id`, the per-message join is unimplementable.
  **Fallbacks (see D14):** (a) **session-level reconciliation only** (`session_id` is in the JWT
  `sid` — always available); (b) the **gateway mints a correlation id** that OpenCode echoes back;
  or (c) **accept the ticker as live-only / non-reconciled** and treat the gateway ledger as the
  sole durable source without per-message merge. Do **not** assert a per-message join the research
  does not support.
- Surface a small **drift metric** (gateway cost vs OpenCode estimate per session — session-level is
  always available) to catch pricing-table staleness on either side.
- **Sequencing nuance:** the §3.1 near-term widening (sandbox-reported tokens → D1, **once the shape
  is verified**) is a _cheap interim_ that unblocks token visibility _with no gateway at all_. It is
  not throwaway — it gives admins per-direction tokens immediately, and the gateway (if approved)
  later becomes the billable/authoritative source over the top.

### 3.3 Data model (D1, aligned with D3 — tenant is a D1 dimension, not a DO-name prefix)

```sql
-- ILLUSTRATIVE SKETCH. Authoritative per-call usage ledger, written by the GATEWAY [PROPOSED — pending D-gateway].
CREATE TABLE usage_events (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT,                 -- from JWT claim (nullable during rollout)
  user_id            TEXT,                 -- resolved from session (canonical users.id)
  session_id         TEXT NOT NULL,        -- JWT sid (ALWAYS observable gateway-side)
  message_id         TEXT,                 -- reconcile key with step_finish ticker — UNVERIFIED gateway can observe it (§3.2, D14); may be NULL → session-level reconcile only
  model              TEXT NOT NULL,        -- resolved upstream model alias
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd           REAL NOT NULL DEFAULT 0,            -- gateway-priced (authoritative)
  source             TEXT NOT NULL DEFAULT 'gateway',    -- 'gateway' | 'opencode'
  created_at         INTEGER NOT NULL
);
CREATE INDEX idx_usage_tenant_created ON usage_events(tenant_id, created_at DESC);
CREATE INDEX idx_usage_tenant_model   ON usage_events(tenant_id, model, created_at DESC);
CREATE INDEX idx_usage_tenant_user    ON usage_events(tenant_id, user_id, created_at DESC);

-- Budgets / limits, enforced pre-flight at the gateway [PROPOSED — pending D-gateway].
CREATE TABLE tenant_budgets (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  period    TEXT NOT NULL CHECK (period IN ('day','month')),
  limit_usd REAL NOT NULL,
  user_id   TEXT,                                  -- NULL = tenant-wide; set = per-dev cap
  PRIMARY KEY (tenant_id, period, COALESCE(user_id,''))
);
```

Keep `sessions.total_cost` (the Tier-1 DO `total_cost REAL`, `schema.ts:29`, synced to D1 via
`durable-object.ts:1458-1485` → `session-index.ts:225-242`) as the **live ticker**; `usage_events`
(if the gateway is built) is the durable/billable truth. **Reconciliation key is UNVERIFIED:** the
intended `(session_id, message_id)` join requires gateway-side `message_id` observability (§3.2);
the always-available fallback is `session_id`-only reconciliation (D14).

### 3.4 Reconciliation with today's sandbox-reported analytics

Today "usage" is _derived_ from `sessions` (no usage table exists). `analytics-store.ts` attributes
per-session (`sessions.total_cost`), per-user (`COALESCE(s.user_id, NULLIF(s.scm_login,''))`,
`:147`), per-repo (`s.repo_owner || '/' || s.repo_name`, `:148`) — but **never** per-model (the
column `sessions.model` exists but `ANALYTICS_BREAKDOWN_BY = ["user","repo"]`,
`shared/src/types/index.ts:664`, has no `"model"`) and **never** per-tenant (no `tenant_id`
anywhere). The reconciliation path:

1. Near-term (**no gateway needed**): _verify the token shape_ (§3.1), then widen `step_finish`,
   persist tokens, add D1 token columns — recovers per-direction tokens from the existing path.
2. Gateway online **[PROPOSED — pending D-gateway]**: `usage_events` becomes authoritative;
   `analytics-store` queries gain a `tenant_id` filter once `sessions.tenant_id` is populated (cheap
   join/where, the column is a no-op add).
3. Add `"model"` to `ANALYTICS_BREAKDOWN_BY` (group on `usage_events.model` / `sessions.model`).

### 3.5 Admin API + which UI it extends

Extend `routes/analytics.ts` (today three GET routes: `/analytics/{summary,timeseries,breakdown}`,
all backed by `AnalyticsStore`, all proxied through `apps/orto/src/app/api/analytics/*` which today
gate on `getServerSession` with **no admin/role check**):

- `ANALYTICS_BREAKDOWN_BY → ["user","repo","model"]`.
- `GET /admin/analytics/summary?tenant=&days=` — tenant-scoped totals incl. token sums + budget
  utilization %.
- `GET /admin/analytics/breakdown?tenant=&by=user|model|repo` — per-dev/model/repo rollups from
  `usage_events`.
- `GET /admin/analytics/timeseries?tenant=&metric=cost|tokens` — daily cost/token series (current
  timeseries is count-only).
- `GET/PUT /admin/budgets` — read/set caps; the gateway reads these for pre-flight enforcement
  **[PROPOSED — pending D-gateway]**.

All admin routes **scoped by the caller's verified tenant + `role='admin'`** (enforced in the
Next.js proxy via `tenant_memberships`, **re-checked in the CP** via the signed claim — §4.3). **UI
it extends** (the existing analytics surface is all dollars + counts, never tokens/model/tenant):
`apps/orto/src/components/analytics/user-table.tsx` (per-dev rollups — reuse directly, add token
columns), `summary-cards.tsx` (add tokens / cache-hit ratio / % budget consumed),
`timeseries-chart.tsx` (real $/token axis vs session counts), plus a new per-model breakdown chart
and a budgets panel. See §7.

---

## 4. Multi-tenancy: data model, RBAC, and how the boundary threads through everything

### 4.1 Where single-tenancy is baked in (FACT)

Single-tenant by **omission**, not by an explicit key. The load-bearing artifacts:

- **No tenant column anywhere in D1** — grep across all 23 migrations → zero hits (`cb-multitenant`
  §1.1).
- **Sign-in is a boolean allowlist, not a tenant resolver** — `checkAccessAllowed()`
  (`apps/orto/src/lib/access-control.ts:37-63`) over flat global lists; answers "may this person
  sign in?", never "which tenant / what may they see?"
- **Per-resource authorization is ABSENT server-side (the strongest finding).** `GET /sessions` →
  `handleListSessions` (`routes/session-index.ts:52-87`) applies **no identity scoping** —
  `createdByUserIds` is an _optional client-supplied filter_; omit it → every session in the
  deployment returns. `DELETE /sessions/:id` (`:89-102`) deletes **any session by id with no
  ownership check**. The orto `createdBy` rewrite is an _opt-in convenience filter_, not an enforced
  boundary.
- **The control plane has no per-user principal.** orto authenticates to CP with **one shared
  service secret** (`INTERNAL_CALLBACK_SECRET`, `apps/orto/src/lib/control-plane.ts:28-45`, verified
  by `verifyInternalToken`, `router.ts:257`). CP sees "the web app," never "user X." This is the
  load-bearing trust-boundary fact.
- **One encryption key per data class, deployment-wide** (`TOKEN_ENCRYPTION_KEY`,
  `REPO_SECRETS_ENCRYPTION_KEY`, `types.ts:58-59`); `global_secrets` PK is **`key` alone**
  (`global-secrets.ts:69`).
- **Bare global DO naming** (`idFromName(sessionId)`, 4 sites) — tenant unrecoverable from a DO
  name, and a DO name is permanent (D3).

### 4.2 The tenant / org / member / role data model (DESIGN)

```sql
-- ILLUSTRATIVE SKETCH.
CREATE TABLE tenants (
  id              TEXT PRIMARY KEY,
  installation_id TEXT UNIQUE,            -- GitHub App installation == org seam (nullable for non-GH)
  display_name    TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- THE missing piece for "admins see their devs": membership + ORG role.
-- NOTE: role here is the ORG axis (admin|member), DISTINCT from participants.role (owner|member, per-session).
CREATE TABLE tenant_memberships (
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  user_id    TEXT NOT NULL REFERENCES users(id),   -- canonical users.id (migration 0019), not scm_login
  role       TEXT NOT NULL DEFAULT 'member',        -- 'admin' | 'member'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id);

ALTER TABLE sessions ADD COLUMN tenant_id TEXT;     -- nullable, no-op add (D3)
CREATE INDEX idx_sessions_tenant_created ON sessions(tenant_id, created_at DESC);
```

This layers cleanly on the existing unified user model (`users`/`user_identities`, migration
`0019`): one `users.id` across providers; membership maps that canonical id to a tenant.
**`installation_id` is the leading candidate org seam** — `parseInstallationMap` already maps
`owner → installationId` (`installation-map.ts`), it is coarser and more stable than `repo_owner`
(survives repo renames, covers all org repos), and it already exists as deployment config. **But per
D3 this is NOT committed into a DO-name prefix now, NOR populated into the D1 column at session
creation** — it is a D1 dimension that stays **nullable and unwritten** until the MT-flip phase
backfills it (`repoOwner → installation_id → tenants.id`). Writing it at creation would silently
commit `installation_id` as the tenant key from the first session — which D7 explicitly defers.
**Never accepted from the client.**

### 4.3 RBAC + where the authorization check must move (the load-bearing decision)

| Capability                                     | `member` | org `admin`   |
| ---------------------------------------------- | -------- | ------------- |
| List/open **own** sessions                     | ✅       | ✅            |
| List/open **all sessions in the tenant**       | ❌       | ✅            |
| View **own** usage/cost                        | ✅       | ✅            |
| View **tenant-wide** usage (per-dev breakdown) | ❌       | ✅            |
| Delete a session                               | own only | any in tenant |
| Manage **org secrets / BYOK**                  | ❌       | ✅            |
| Manage **org-level OpenCode commands/agents**  | ❌       | ✅            |
| Invite/remove members, set roles               | ❌       | ✅            |

No super-admin / no cross-tenant visibility (single GitHub-App-install deployments). **The check
must move into the control plane, which must receive a _verified principal_, not a query param.**
Recommended (DESIGN): orto resolves `user → (tenant_id, role)` from `tenant_memberships` and
forwards it as a **signed claim** by extending the existing internal token
(`generateInternalToken`/`verifyInternalToken`, `auth/internal.ts`) to carry `sub=userId`,
`tenant_id`, `role` — reusing the existing service-token machinery, not a new surface. The CP
introduces a tenant-scoped resolver at the list/delete/secret handlers that **rejects unscoped
list/delete** (closes the absent-authorization gap), forces
`WHERE user_id = <sub> AND tenant_id = <tenant>` for members (the client filter can only _narrow_
within scope, never widen), scopes to `WHERE tenant_id = <tenant>` for admins, and on `DELETE`
asserts `session.tenant_id == claim.tenant_id` (+ member: `session.user_id == claim.sub`) before
deleting. The alternative (resolver stays only in orto, CP stays principal-blind) is **rejected** —
any direct CP call still bypasses the boundary. The sign-in allowlist (§4.1) stays as-is; it still
gates _who logs in_, a separate concern.

### 4.4 How the boundary threads through each workstream

- **Agent naming (`sessionAgentName`) — bare now (D3).** Returns the bare `sessionId`; tenant lives
  in the nullable D1 `sessions.tenant_id` column, _not_ the DO name. Authorization depends on the D1
  row's `tenant_id`, **not** on the name being prefixed — this is what lets MT be a config flip on
  the _authorization_ path while the _physical name_ commitment stays deferred. The only
  irreversible item (prefixing the DO name) waits for MT-enablement.
- **Gateway token claim — add `tenant_id` (+ `user_id`) [PROPOSED — pending D-gateway].** _If_ the
  gateway is approved: the sandbox JWT (evolving from the existing sandbox token, carrying
  `sid`/allowed-models/`exp`) gains a `tenant` claim. `mintJwt` (`auth/jwt.ts:16`) is the mint
  point. The gateway resolves the upstream credential **per-tenant server-side** keyed on the claim,
  never trusting the sandbox. The credential-ownership model itself (platform-holds-all-keys vs
  tenant-BYOK vs per-tenant-OAuth-minted) is **a genuine security/product/trust fork, not a
  resolution detail — see D11.** The sandbox holds only the short-lived token — no raw provider
  keys.
- **Usage — tenant + dev at the gateway [PROPOSED — pending D-gateway].** `usage_events` rows tagged
  `tenant_id` + `user_id` (§3.3); admin rollups `GROUP BY user_id WHERE tenant_id = ?`, member
  rollups add `AND user_id = ?`.
- **BYOK — per-tenant keys.** Live in a tenant-scoped secret store. This is where the
  **`global_secrets` PK problem bites**: a per-tenant key namespace needs `tenant_id` in the
  uniqueness key, which is a **table rebuild** in SQLite/D1 (create new table with
  `PRIMARY KEY (tenant_id, key)`, copy, swap) — **not** a nullable-column add. Encryption should
  move from one deployment-wide key toward a per-tenant data key (or a `tenant_id`-salted scope) so
  a tenant's ciphertext isn't decryptable in another tenant's context — a re-encryption migration,
  also not a column add. **Whose keys these are is D11 (credential-ownership model).**
- **Org commands/agents — the tenant level slots between `global` and `repo`.**
  `integration-settings.ts` has exactly two levels (`SettingsLevel = "global" | "repo"`, `:17`). Add
  `"tenant"`; resolution precedence becomes **repo → tenant → global** (extending
  `getResolvedConfig` `:154-188`). Org admins manage OpenCode commands/agents at the tenant level
  (§5, §6).

### 4.5 Irreversible choices (call out before committing)

1. **Committing the tenant key into a DO-name prefix** — permanent (strands SQLite on rename).
   Deferred per D3; the D1 `tenant_id` path carries the boundary meanwhile and is fully reversible.
   `installation_id` is the _recommended_ key when the flip happens, but the flip itself is the
   one-way door.
2. **`global_secrets` PK change** (adding `tenant_id` to the uniqueness key) — a one-way table
   rebuild; do it once, when secret count is known-small. **Downstream of D11.**
3. **Per-tenant encryption** — once tenant data keys exist, you can't cheaply un-scope without
   re-encryption. **Downstream of D11.**
4. **The `compatibility_date` bump** the SDK requires (v1 §7) — verify it doesn't alter
   `SessionDO`/`SchedulerDO` behavior first.

Everything in the MT-0 seam phase (nullable columns, unread tables, ignored params) is reversible
(drop them). The first irreversible commitments are #1–#3, all deferred behind cheap seams.

---

## 5. OpenCode plugin + slash commands

### 5.1 The config-hook auth/gateway plugin [PROPOSED — pending D-gateway]

> **[PROPOSED — pending D-gateway]** This whole subsection presupposes the LLM gateway exists. It is
> **not** decided (§9 `D-gateway`). If the gateway is deferred/declined, the config-hook plugin and
> the provider-repoint are not built; OpenCode keeps using injected provider keys as today.

_If the gateway is approved_, OpenCode is repointed at the internal LLM gateway via a **config-hook
plugin**: a plugin's async factory + `config(cfg)` hook fetches `/v1/models` from the gateway at
startup and sets a single custom provider's `baseURL` → gateway, `headers` → the sandbox token, and
`models` → the gateway catalog. OpenCode pulls 75+ providers from Models.dev via the AI SDK and
supports custom providers under `provider` with their own `models` (DOC). Note: the
`@ai-sdk/openai-compatible` `baseURL` wiring is **not** in the fetched docs excerpt (**UNCERTAIN**);
the config-hook plugin mechanism is the proposed mechanism that would cover it. **Injection seam
already exists:** the sandbox runtime copies plugins into `.opencode/plugins/` at boot
(`entrypoint.py:823-830`, FACT — codex-auth plugin precedent). So the auth/gateway plugin would be a
new asset alongside existing injected plugins; **no new OpenCode capability needed.**

### 5.2 Org/tenant-level slash command injection

**How commands are defined (DOC):** two equivalent surfaces, both landing in the server-side
`config.command` object — (a) markdown `.opencode/commands/*.md` (filename → `/name`; frontmatter
`description`/`agent`/`model`; body = prompt template) and (b) the `command` key in `opencode.json`
(required `template`, optional `description`/`agent`/`model`). Template features: `$ARGUMENTS`,
positional `$1..$n`, `` !`cmd` `` shell injection, `@file` inclusion — **but `` !`cmd` `` and
`@file` only resolve when OpenCode expands the template**, so pre-expanding CP-side drops them.

**Recommended delivery path — config-object via `OPENCODE_CONFIG_CONTENT` (verified seam).** The
entrypoint already passes `OPENCODE_CONFIG_CONTENT = json.dumps(opencode_config)` (precedence #6,
overlays project files) at `entrypoint.py:834` (**FACT**). Merging a tenant's `command: {...}`
entries into that dict makes them **unambiguously** appear in `config.command` (and so
`GET /command`). **This is the recommended default** because it sidesteps the `GET /command`
markdown-source uncertainty (a TUI-source claim says `.md` files load into `config.command` but
don't auto-appear in the TUI palette — `tips-view.tsx`, **C7**, but that's about the _TUI's_
palette, which we don't ship). The file-copy alternative (`_install_commands(workdir)` mirroring
`_install_skills`, `entrypoint.py:493-519`) works but inherits that uncertainty.

**Per-tenant command libraries — the delivery mechanism is a fork (D12), not a settled lead.**
Image-baked assets are _global_ (`add_local_dir → /app/...`, `images/base.py:208`, FACT) — fine for
shared/default commands, wrong for per-tenant. Per-tenant sets must be **sourced per session**,
keyed on the tenant — exactly the kind of per-tenant asset the D3 `tenant_id` seam is designed to
provide. **Two delivery mechanisms, surfaced as D12:**

- **`OPENCODE_CONFIG_CONTENT` inline injection (recommended default, verified seam at
  `entrypoint.py:834`)** — merge tenant commands into the config dict using a per-session tenant id
  in `session_config`. Lower-friction, single-tenant-compatible today, no dependency on the gateway
  or on unverified OpenCode fetch behavior.
- **`.well-known/opencode` remote config (precedence #1) — contingent optimization [PROPOSED —
  pending D-gateway].** A central endpoint serving per-tenant `command`/`agent`/`mcp` config, which
  would dovetail with the gateway Worker (same stateless Worker keyed on the sandbox token's
  `sid`/`tenant`). **⚠️ UNCERTAIN and load-bearing:** it is **not established** that OpenCode
  fetches `.well-known/opencode` **with custom auth headers** — verify against the pinned version.
  If it does not, this path is unworkable and `OPENCODE_CONFIG_CONTENT` is the only option. Do
  **not** treat `.well-known` as the lead.

### 5.3 Backend vs UI split

- **Backend (CP / bridge):** the bridge today POSTs prompts to `/session/{id}/prompt_async` and
  consumes `/event` SSE (`bridge.py:939-940`); it does **not** call `/session/:id/command`. Command
  support is **additive**: `GET /command` to list, `POST /session/:id/command` to execute (returns
  `{info, parts}`) with OpenCode doing template expansion (preserving `!` shell + `@file`). Carry a
  command invocation via a **new `command` WS command type** alongside `prompt` in the
  SandboxCommand wire schema; the bridge dispatches it to `/session/:id/command` instead of
  `prompt_async`. **Do not pre-expand CP-side** (drops `` !`cmd` ``/`@file` and would require the CP
  to run shell in the sandbox — it can't). This is **purely additive to the wire protocol** — it
  does not disturb the `ackId`/buffer/replay contract v1 pins byte-for-byte, and leg-B's socket
  shape is unchanged (consistent with "Modal/`bridge.py` unchanged").
- **UI (`apps/orto`):** a command palette is a thin client over a new CP endpoint that proxies
  `GET /command` (per session — availability is sandbox/tenant-scoped), independent of OpenCode's
  TUI palette (which we don't ship). The shared composer already has the primitives — see §7.

---

## 6. OpenCode agents support — end to end

### 6.1 What an OpenCode agent is (DOC/C7)

A named config bundle determining, per turn: which model runs, the system prompt, which tools it can
call, and each tool's permission (allow/ask/deny). "Modes" and "agents" are the same concept now
(the `/docs/modes/` page 404s, folded into `/docs/agents/`). Two kinds via the `mode` field
(`primary | subagent | all`): **primary** agents (Tab-cycled; built-ins **Build** = all tools,
**Plan** = `edit`/`bash` default to `"ask"`) and **subagents** (invoked by a primary via the **Task
tool** with `subagent_type`, or by `@mention`; built-ins General/Explore/Scout). Per-agent fields:
`description`, `mode`, `model` (`"provider/model-id"`), `prompt`, `temperature`, `top_p`, `steps`,
`tools` (allow/deny map), `permission` (granular per-tool allow/ask/deny, glob-matched,
last-match-wins), `disable`, `hidden`, `color`, + provider passthrough (e.g. `reasoningEffort`).

### 6.2 Current state (FACT) — exactly one `(model, reasoningEffort)`, no agent concept

- Sandbox builds OpenCode config with a single `model` and **blanket
  `permission: {"*": {"*": "allow"}}`** (`entrypoint.py:800-810`); **no `"agent"` block**.
- The bridge's prompt POST sends `{"parts":[...], "model": {...}}` — **no `agent` field**
  (`bridge.py:825-861`).
- Wire protocol carries `model` + `reasoningEffort` end-to-end — **no `agent`/`subagent` field**
  (`shared/src/types/index.ts`).
- Model catalog is a fixed allow-list `VALID_MODELS` + `MODEL_REASONING_CONFIG`
  (`shared/src/models.ts:12-30`), surfaced via `settings/models-settings.tsx`.

### 6.3 Backend threading required

1. **Agent catalog + selection.** Add optional `agent` (string) to prompt/session-create input.
   **Selection scope is a PRODUCT fork (D13), not a settled choice** — both per-session-default and
   per-prompt-override are supported (the assistant record stamps `agent` per message, **C7**),
   mirroring how `model`/`reasoningEffort` already work. The dossier marks this explicitly a product
   decision; surface it as D13 rather than asserting one shape.
2. **Thread `agent` through the wire protocol** — new optional field next to
   `model`/`reasoningEffort` in `shared/src/types/index.ts`.
3. **Pass `agent` into OpenCode** — add to `request_body` in `bridge.py:825-861` (next to `model`);
   read `cmd.get("agent")` in `_handle_prompt` (`bridge.py:596-600`).
4. **Inject agent definitions** — write `.opencode/agents/*.md` (plural is canonical; singular
   accepted) and/or an `"agent": {...}` block in `opencode_config` (`entrypoint.py:800`), reusing
   the `_install_tools`/`_install_skills` pattern (`entrypoint.py:429-519`). Source of truth = a
   host-side agent registry (analogous to `VALID_MODELS`); for org-scoped agents, the tenant level
   of §4.4 / the `OPENCODE_CONFIG_CONTENT` (recommended) or `.well-known/opencode` (contingent, D12)
   path of §5.2.
5. **Reconcile permissions (non-obvious dependency — a global behavior change, NOT a default-off
   field).** Today's blanket `permission: {"*": {"*": "allow"}}` (`entrypoint.py:809`) **defeats
   Plan-mode and restricted-subagent/restricted-org-agent semantics** — a restricted agent's
   `edit: ask`/`deny` is meaningless if the global config forces allow. To get real Build-vs-Plan
   behavior we must **stop forcing global allow** and let agent-level permission win. **This is a
   global tool-permission posture change for every session** (a previously-allowed tool can now
   `ask`/`deny`), so it is **not** reversible-by-default-off and must be its own cohort-gated,
   validated sub-step (does Build-mode still do everything it did?) — see Phase OC-AC, which splits
   it out. (Also: headless `serve` already disables the `question` tool, `entrypoint.py:835-839`, so
   any agent relying on `ask`-prompts needs a host channel that doesn't exist today.)
6. **Event protocol: agent/subagent switches DO produce renderable events.** Assistant messages
   carry `agent` + `mode`; subtasks are a distinct `SubtaskPart` with their own `agent`/`model`
   (**C7**). The bridge today streams token/tool parts but does **not** surface
   `agent`/`mode`/SubtaskPart boundaries (`bridge.py:914-970`). Rendering subagent activity requires
   **propagating `agent`/`mode` (and SubtaskPart) through bridge → CP event log → client** — a real
   protocol addition (new optional event fields), not free.
7. **Gateway/catalog tie-in [PROPOSED — pending D-gateway].** _If the gateway is approved_,
   per-agent `model:` overrides are just more aliases the gateway publishes via `/v1/models`; agents
   reference `<gateway-provider>/<alias>`, the gateway maps alias→upstream + resolves the credential
   server-side. The per-tenant JWT `allowed-models` claim naturally bounds which `model:` values an
   injected agent may name. _Without_ the gateway, per-agent models reference the existing
   `VALID_MODELS` allow-list directly; agent injection and the model allow-list must stay consistent
   either way.

### 6.4 Relationship to the SDK migration

**Orthogonal to and independent of D0–D3.** It touches sandbox-runtime + wire protocol + UI, **not**
the per-session DO's WS/sync mechanics, so it can land before/during/after the spike without
interacting with the second-peer question. The one overlap is the naming-trap hygiene (§ top):
"OpenCode agent" ≠ "`SessionAgent`."

---

## 7. UI workstream

Two cross-cutting facts reorder this work (`cb-ui`):

- **FACT — the shared `@orthogonal/ui/ai` component kit is built but UNUSED by orto**
  (`apps/orto/src` imports it **zero** times). It already ships `Composer` + `PromptInput` +
  `SlashCommandPopover` (with `SLASH_PATTERN`, command filtering, keyboard nav,
  `commands`/`onSubmit`/`onCommand` props), `Task`/`Tool`/`ToolGroup` (purpose-built for
  nested/agentic steps), `message`/`conversation`/`reasoning`. The session page instead hand-rolls a
  raw `<textarea>` + `Combobox` (`session/[id]/page.tsx` ~1011-1097). **Migrating the prompt box to
  the shared `Composer` is a shared prerequisite for slash commands AND agents** — cost it once.
- **FACT — the model catalog is STATIC** (`VALID_MODELS`/`MODEL_OPTIONS` in `shared/src/models.ts`);
  no dynamic/gateway/per-tenant catalog. A **dynamic catalog in `@open-inspect/shared`**
  (gateway-driven _if_ D-gateway lands; otherwise a refactor of the static allow-list to be
  CP-sourced) is a shared upstream dependency of: per-agent model badges, per-model analytics, and
  BYOK. Treat it as one refactor, not a per-item cost.

| Workstream              | Reuse (exists today)                                                                                               | Genuinely new                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) OpenCode agents** | `Combobox` + `Badge`; unused `@orthogonal/ui/ai` `Task`/`Tool`/`ToolGroup` for subagents                           | Agent selector wired into the composer toolbar (the `toolbar` slot at `composer/index.tsx:55-62` is explicitly "for a model selector or effort control" — agent dropdown drops in beside model/effort; replaces the dead non-interactive `"build agent"` label at `page.tsx:1096`); optional `AgentBadge` shared component; subagent timeline block (keyed off the new `agent`/`mode`/SubtaskPart event fields from §6.3 #6 — **joint** backend+UI). Thread `agent` into `sendPrompt` → socket frame `{type:"prompt", ..., agent}` (`use-session-socket.ts:697`). |
| **(b) Slash commands**  | **Unused `Composer` + `SlashCommandPopover` + `PromptInput*`**                                                     | Mostly _migration_ of the raw `<textarea>` to `Composer`; command-dispatch glue (`onCommand` → resolved command frame via `sendPrompt`). The hard parts already exist and are tested.                                                                                                                                                                                                                                                                                                                                                                             |
| **(c) Admin usage**     | `analytics/user-table.tsx` (per-dev rollups — near-free), `summary-cards.tsx`, charts, `Badge`, `ToggleGroup`      | Per-model breakdown (`by=model` route + `AnalyticsBreakdownEntry` fields), budget meter (template: the `CompletionRateCell` progress bar + `SummaryCard`), admin/role scoping. Mostly backend/types with thin UI.                                                                                                                                                                                                                                                                                                                                                 |
| **(d) Multi-tenant**    | `DropdownMenu`, `Dialog`/`AlertDialog`, `Select`, `Switch`, `Tabs`; settings-panel + `secrets-editor.tsx` patterns | `OrgSwitcher` in the nav sidebar (`session-sidebar.tsx`); members/roles table (no generic table primitive exists in `packages/ui` — `user-table.tsx` is bespoke; promote or keep app-local); org-settings panels (secrets/BYOK/commands/agents) mirroring `models-settings.tsx`/`secrets-settings.tsx`. Extend `settings-nav.tsx` `NAV_ITEMS` with `members`/`organization`. **Largest UI lift**, carries the heaviest new backend/data-model.                                                                                                                    |

**`packages/ui` vs `apps/orto` split (a Section-9 fork):** every `packages/ui` component ships
co-located `.stories.tsx` + `.test.tsx` (FACT) — promoting a component there costs more.
Recommendation: keep analytics/admin components **app-local** in
`apps/orto/src/components/analytics/` (they already are, table/chart patterns reuse in place);
promote to `packages/ui` only the genuinely reusable primitives (`AgentBadge` if the badge gets
non-trivial; a generic `DataTable` only if members + users tables both want it). Reuse the
already-built-but-unused `@orthogonal/ui/ai` kit aggressively before building anything new.

**UI dependency order:** (1) shared foundations — dynamic catalog in `shared`, org/tenant model in
CP+shared types, composer migration; then (2) **slash commands** (cheapest after composer
migration); (3) **agents** selector/badge (after dynamic catalog + agents backend), subagent
timeline last; (4) **admin usage** (per-dev near-free, per-model + budgets after analytics
aggregation, admin scoping after the org model); (5) **multi-tenant** UI (largest; its data model
lands early as an upstream dep even though the bulk of its UI is last).

---

## 8. Revised end-to-end phased roadmap

**Track legend:** **[SDK]** = on the SDK-migration critical path (the second-peer question).
**[GW]** = gateway/auth hub **[PROPOSED — conditional on D-gateway]**. **[OC]** = OpenCode
sandbox-runtime/wire-protocol track (orthogonal to [SDK]). **[MT]** = multi-tenant. **[UI]** =
front-end. Phases that can run **in parallel** are marked; the gate (P0+P1a) is first and blocks the
[SDK] track only.

> **Two independent gates.** (1) **Phase 0 + Phase 1a are unchanged from v1 and are the [SDK] gate**
> — SDK-coupled items from Phase 1b onward are "_if_ P1a green-lights." (2) **`D-gateway` (§9) is a
> second gate** — Phases **G** and **Me** and the entire metering/BYOK/per-tenant-catalog cluster
> are "_if_ `D-gateway` is approved," exactly mirroring how the [SDK] phases gate on 1a. The
> non-gateway items ([OC], [MT-D1] seams, M-near) are gated by neither and may proceed in parallel.

### Phase 0 — Naming + tenant seams (no SDK) [SDK-prep][MT]

v1 Phase 0, **unified with the dossier's MT-0 seams** (the nullable `sessions.tenant_id` appears in
both — one column, not two). Introduce `sessionAgentName(sessionId)` (returns **bare** id) routing
the four `idFromName` sites. Add nullable `tenant_id` to `sessions` (+ `repo_secrets`); create
unread `tenants`/`tenant_memberships` tables; thread **ignored** `tenantId?`/`ownerId?` through
`SessionInitInput`, secret stores, `ListSessionsOptions`. **`sessions.tenant_id` is left NULL — it
is NOT populated at creation** (aligns with v1's ignored-param seam; population is deferred to
MT-flip, which backfills — writing it now would soft-commit `installation_id` as the key, which D7
defers). **Blast radius:** tiny. **Reversibility:** fully reversible (drop columns/tables). **Prereq
decisions:** D3 (keep names bare). Independently mergeable.

### Phase 1a — No-traffic `SessionAgent` spike (THE GATE) [SDK]

v1 Phase 1a, **unchanged and deliberately Drizzle-FREE.** Keep v1's `initSchema()` spike — the
gate's entire value is a clean second-peer stop/go signal with **zero domain logic and no new
fast-moving pre-1.0 dependency** muddying it. Verifies: two-phase DO-binding deploy for an Agent
class; `SessionAgent`/`SessionDO` coexistence; `getAgentByName` round-trip; **the §4.3b second-peer
MUST-VERIFY** (hand-accepted tagged sandbox socket excluded from `getConnections()`/`setState`
auto-broadcast). **Blast radius:** zero production sessions. **Reversibility:** no rollback surface.
**This is the stop/go gate** — if the second peer can't be cleanly hosted, halt the [SDK] track
(re-open D0). Re-pin **`agents`** here. (**Drizzle is NOT introduced here** — the
`migrate()`/journal-table/`cf_agents_*` coexistence check and the `drizzle-orm`/`drizzle-kit` re-pin
move to Phase 1b, §2.2.)

### Phase G — LLM gateway + token auth redesign [GW] (PROPOSED — conditional on D-gateway; parallel to P1a if approved)

> **[PROPOSED — pending D-gateway]** This phase only exists if `D-gateway` (§9) is approved. It is
> **not** "already decided."

Stand up the stateless gateway Worker (optionally fronting Cloudflare AI Gateway). Evolve the
sandbox token → signed JWT carrying `sid`/`tenant`/`allowed-models`/`exp` (`mintJwt`,
`auth/jwt.ts:16`). Ship the OpenCode **config-hook plugin** (§5.1) into `.opencode/plugins/`
(precedent `entrypoint.py:823-830`); point OpenCode's custom provider at the gateway; stop pushing
raw provider keys into sandbox env. **This is a cutover touching the entire LLM path of every active
session — give it the same cohort-gate + runtime kill-switch discipline as Phase 1b:**

- **Cohort gate (required):** roll the gateway/plugin to **one `repo_owner` cohort first**; everyone
  else keeps env-key injection.
- **Per-session togglable fallback (required, not just "while iterating"):** keep raw env-key
  injection as a **runtime-switchable** per-session fallback so any session can be reverted to
  direct provider keys without a deploy.
- **Parity/health check before widening (required):** define a gateway-vs-direct parity/health check
  (provider responses, latency, error rates, token attribution) and pass it on the cohort before
  widening to a percentage/all.
- **Blast radius (honest):** **all LLM traffic for every gated session** (auth + provider routing).
  No SDK/DO impact. **Reversibility:** medium — revert a session to env-key injection via the
  togglable fallback; the kill-switch protects new sessions, in-flight sessions revert on next
  inference. **Prereq:** `D-gateway` approved (independent of P1a). **This is the prerequisite hub**
  for metering, BYOK, and per-tenant catalogs.

### Phase M-near — Near-term token visibility [OC] (parallel; not gated by P1a OR D-gateway)

The cheap win (§3.1) — **needs no SDK change and no gateway.** **First verify the emitted token
shape** against the pinned OpenCode version in a real sandbox (object `{...}` vs scalar — the only
repo fixture asserts a scalar and the wire type is `tokens?: number`, so this is **CONDITIONAL on
the shape check, not "verified, available today"**). Then: widen `step_finish` to carry whatever the
runtime actually emits, persist it in `sandbox-events.ts` (currently discards it), add token columns
to D1, fix the inaccurate `tokens?: number` type to match reality. **Blast radius:** wire type + one
CP handler + a D1 migration. **Reversibility:** high. **Prereq:** none (this is the D6-B /
status-quo path). Gives per-direction tokens _before_ (and independent of) any gateway meter.

### Phase 1b–3 — SessionAgent rewrite of the session layer [SDK] (only if P1a green-lit)

v1 Phases 1b → 2 → 3, **now a ground-up rewrite (D1)** with Drizzle as the DO store from day one
(§2.2). **1b is where Drizzle is introduced** (not 1a): swap `initSchema()` →
`migrate(this.db, migrations)`; assert the drizzle journal-table name in the `cf_agents_*` collision
check; restate `migrate()`-vs-`cf_agents_*` init-ordering determinism; **re-pin
`drizzle-orm`/`drizzle-kit` here**; parity-check the 62 query sites + keyset pagination + upserts vs
the `SessionDO` baseline (MEDIUM effort/risk). 1b also: one `repo_owner` cohort, full stack,
**bare** `sessionAgentName`, kill-switch (creation-time gate; in-flight wedge = accepted blast
radius, manual recovery), shadow-parity vs `SessionDO`. 2: harden + widen. 3: cutover + decommission
(no DO→Agent copy). **Blast radius:** grows per phase (one cohort → percentage → all new sessions).
**Reversibility:** kill-switch for _new_ sessions only; in-flight Agent sessions have no live
escape. **Prereq decisions:** D1 (rewrite), D2 (hand-rolled leg-B auth), D4 (`this.sql` SoR), **D5
(Drizzle scope)**. **Load-bearing safety net:** `test/integration` + shadow parity (the rewrite
raises regression risk).

### Phase MT-flip — Multi-tenant enablement [MT] (after Phase 0; gateway claim conditional on Phase G / D-gateway)

Backfill `sessions.tenant_id` (from `repo_owner → installation_id → tenants.id` — **this is where
population happens, not Phase 0**); seed `tenant_memberships`; extend the internal token to carry
verified `sub`/`tenant_id`/`role` (§4.3); flip the CP resolver (**reject unscoped** list/delete,
enforce tenant+role scoping — closes the absent-authorization gap). **If `D-gateway` is approved:**
the gateway starts reading the `tenant` claim. **Blast radius:** authorization on every list/delete
(+ gateway credential resolution if Phase G shipped). **Reversibility:** the _flip_ is reversible
(re-allow unscoped) but is a behavior change requiring deliberate review. **Prereq:** Phase 0
(seams); the gateway-claim portion additionally requires `D-gateway` + Phase G.

### Phase MT-rebuild — The irreversible MT migrations [MT] (after MT-flip, when needed; BYOK pieces gated on D11)

`global_secrets` → org secrets/BYOK (PK rebuild: `PRIMARY KEY (tenant_id, key)`); per-tenant
encryption key scoping (re-encryption); finalize `usage_events`/`tenant_budgets`. **The BYOK/secret
pieces depend on D11 (credential-ownership model) and, for the gateway-priced ledger, on
D-gateway.** **Blast radius:** secret store + encryption. **Reversibility:** **one-way** (the §4.5
irreversibles). Do once, when secret count is known-small. **Prereq:** MT-flip stable; D11 resolved.

### Phase Me — Gateway as authoritative meter + admin usage [GW][MT] (PROPOSED — conditional on D-gateway; after Phase G + MT-flip)

> **[PROPOSED — pending D-gateway]** Only exists if `D-gateway` is approved. The no-gateway
> alternative is Phase M-near (status quo), which stands alone.

Gateway writes `usage_events` (authoritative); demote `step_finish.cost` to live ticker; **reconcile
— but the key is UNVERIFIED:** the intended `(session_id, message_id)` join requires gateway-side
`message_id` observability (§3.2), which is **not established**; choose the reconciliation
granularity per **D14** (session-level-only / gateway-minted correlation id /
live-only-unreconciled). Budgets enforced pre-flight; admin analytics API + `by=model`. **Blast
radius:** new write path + analytics routes. **Reversibility:** high (additive ledger). **Prereq:**
`D-gateway` approved, Phase G (gateway), MT-flip (tenant claim/scoping). The Section-9 fork D6
(durable meter source) and D14 (reconciliation granularity) resolve here.

### Phase OC-AC — OpenCode agents + commands [OC] (parallel; not gated by P1a) — SPLIT into additive vs behavior-changing

Two distinct kinds of change with **different reversibility**:

**OC-AC-add (additive, default-off, reversible):** backend threading for agents (§6.3 #1–4, #6) and
the `command` WS type + `/session/:id/command` dispatch (§5.3); propagate `agent`/`mode`/SubtaskPart
through the event log; org-scoped command/agent injection via tenant-level config (§4.4, §5.2 —
`OPENCODE_CONFIG_CONTENT` default, `.well-known` contingent per D12). **Blast radius:**
sandbox-runtime + wire protocol (additive — does **not** disturb the `ackId`/buffer/replay contract;
new optional fields, default off). **Reversibility:** high. **Prereq:** for org-scoping, the MT
tenant seam (Phase 0/MT-flip); the _single-tenant_ version needs neither.

**OC-AC-perm (behavior-changing, NOT default-off — separate cohort-gated sub-step):** remove the
blanket `permission: {"*": {"*": "allow"}}` at `entrypoint.py:809` so agent-level `ask`/`deny` can
win (§6.3 #5). **This is a global tool-permission posture change for every session** — a
previously-allowed tool can now `ask`/`deny`. **Blast radius:** every session's tool-permission
posture. **Reversibility:** _not_ a default-off field — needs its own cohort gate + validation
(confirm Build-mode still performs every operation it did pre-change; confirm restricted agents now
honor `ask`/`deny`) before fleet-wide rollout. **Prereq:** OC-AC-add (agent definitions must exist
to test restricted semantics).

### Phase UI — Front-end [UI] (tracks the backends it consumes)

Shared foundations (dynamic catalog, org/tenant types, **composer migration** — the shared prereq
for agents+commands UI), then slash-command palette → agent selector/badge → subagent timeline →
admin usage → org switcher/members/org-settings. **Blast radius:** front-end only.
**Reversibility:** high. **Prereq:** each UI slice gates on its backend (commands → OC-AC-add
command dispatch; agents → OC-AC-add + dynamic catalog; admin usage → Phase M-near for token
columns, Phase Me for the authoritative meter; org mgmt → MT-flip).

**Critical-path summary:** P0 → **P1a (SDK gate)** → [SDK rewrite 1b–3, where Drizzle lands]. In
parallel, **gated on `D-gateway`**: **Phase G (hub)** → {Me, BYOK, OC per-tenant remote-config}. Not
gated by the gateway: **M-near** (status-quo token visibility, anytime, shape-check first);
**OC-AC** (orthogonal — additive part free, the permission removal cohort-gated separately); **MT:
P0 seams → flip → rebuild**; **UI tracks its backends**. The two hard serializations are the **P1a
gate** for the [SDK] track and the **`D-gateway` gate** for the metering/BYOK/per-tenant-catalog
cluster.

---

## 9. Decision points for the human (the NEW genuine forks)

v1's D0–D4 stand (gate, rewrite, leg-B auth, defer tenant key, `this.sql` SoR). These are the
**new** forks this v2 surfaces. Each leads with the recommendation, then the one driving constraint
(v1 §9 house style). **`D-gateway` is the FIRST fork because most of the
metering/BYOK/per-tenant-catalog cluster is conditional on it.**

### D-gateway — Introduce a stateless LLM-gateway Worker as the auth/metering/BYOK/catalog hub? (THE META-FORK — decide this first)

- **A: Yes — build it.** A new stateless Worker fronts all provider traffic: verifies the sandbox
  JWT (`tenant`/`sid`/`allowed-models`), resolves the upstream credential server-side, publishes a
  per-tenant model catalog via `/v1/models`, prices/meters every call, and enforces budgets
  pre-flight.
- **B: No — keep status quo.** OpenCode keeps using injected provider keys; metering stays
  sandbox-reported (the §3.1 / Phase M-near path); no per-tenant catalog, no pre-flight budgets.
- **C (recommended default unless metering/BYOK is a near-term product requirement): Defer.** Ship
  the non-gateway wins now (M-near token visibility, OC agents/commands, MT seams + RBAC flip) and
  revisit the gateway when BYOK / per-tenant catalogs / budget enforcement become real requirements.
- **Constraint:** _the gateway is a genuinely new, costly architectural commitment (a whole new
  Worker fronting every LLM call) and it is **not in the durable record** — v1 decided only D0–D4,
  there is no ADR for it, and `src/auth` has only a generic `mintJwt`. Phases G and Me and the
  entire metering/BYOK/per-tenant-catalog cluster rest on it, so it must be an explicit human-owned
  decision, not "prior context."_ The strongest forcing functions for **A** are (i) BYOK /
  per-tenant credentials, (ii) pre-flight budget enforcement, and (iii) an authoritative billable
  meter — none of which the status-quo path can provide. Absent those as near-term requirements,
  **C** captures the cheap wins first and avoids committing to the hub before its dependents are
  needed. **Everything tagged [PROPOSED — pending D-gateway] in this doc is downstream of this
  fork.**

### D5 — Drizzle scope

- **A (recommended): Adopt in the `SessionAgent` rewrite DO store (Phase 1b, MEDIUM effort/risk);
  defer D1 as independent query-layer-only cleanup; never drizzle-kit runtime migrate on D1.**
- B: Drizzle for D1 only (the lowest-risk-in-isolation surface), skip the DO store.
- C: Drizzle everywhere including retrofitting the legacy `SessionDO`.
- D: Skip Drizzle entirely.
- **Constraint:** \_the decided green-field rewrite (D1) makes the rewrite the cheapest moment for
  DO-store Drizzle (baseline current schema as `0001`, no 31-replay; cheaper than retrofitting a
  working system) — **but it is still a MEDIUM effort/risk re-expression** (62 query sites + keyset
  pagination + `ON CONFLICT` upserts, parity-checked vs `SessionDO`; `durable-sqlite` driver less
  battle-tested), not free — while the bespoke
  `NNNN\__.sql`/`_schema_migrations(version TEXT)`/Terraform pipeline makes D1-as-migrator a fight
  not worth picking.\* C is rejected (retrofitting the throwaway `SessionDO`is throwaway work +
  max-collision with`cf_agents_\*`). D leaves the highest type-safety gap (unchecked `as T[]` casts)
  unaddressed in a rewrite that touches the schema anyway. **Drizzle is introduced in Phase 1b,
  never folded into the Phase 1a gate.**

### D6 — Metering source of truth: gateway-authoritative vs sandbox-reported

- **A — Gateway-authoritative [CONTINGENT on D-gateway AND on `message_id` observability]:** gateway
  is the durable/billable authority; `step_finish.cost` demoted to a live in-session ticker;
  reconcile per **D14** (the `(session_id, message_id)` join is **UNVERIFIED** — see §3.2); surface
  a drift metric.
- **B (recommended interim / status-quo default): Sandbox-reported.** Keep `step_finish` as the
  durable source (widen it with the token data **once §3.1's shape check passes**), no gateway meter
  — **no new infra.**
- **Constraint:** \*only the gateway sees the raw provider request/response (unambiguous tokens
  regardless of OpenCode's emit shape), holds the trusted attribution keys, is the pricing source
  going forward, and is the only place budget enforcement can live — **but A requires `D-gateway` to
  be approved (a whole new metered Worker) and depends on the unverified `message_id` join, while B
  is the status quo with zero new infra.\*** B is the right **default and interim** (the §3.1 win
  unblocks visibility with no gateway); choose A only if `D-gateway` is approved AND per-message
  attribution is verified (else fall back to D14's session-level reconciliation). This fork is
  **downstream of `D-gateway`**, not "which source is authoritative given a free gateway."

### D7 — Tenant key & when to flip

- **A (recommended, = D3): Keep DO names bare; carry tenant in the nullable D1 `tenant_id`, left
  NULL until MT-flip backfills; `installation_id` is the leading candidate key, committed only at
  MT-enablement.**
- B: Commit `installation_id` into the DO-name prefix now.
- C: Commit `repo_owner` now.
- **Constraint:** _a DO name is permanent (renaming strands SQLite); the data says ownership is
  `user_id`, `repo_owner` is only a proto-tenant, and the authorization boundary lives in the D1
  row's `tenant_id` — not the name._ The dossier's "`installation_id` is the principled seam" is a
  recommendation for _which key when we flip_, not a now-commitment; B/C are the irreversible doors
  D3 deliberately keeps shut. **Note also:** populating `sessions.tenant_id` at session creation
  (rather than at MT-flip backfill) would soft-commit `installation_id` as the key from the first
  session — so Phase 0 leaves it NULL and MT-flip backfills (§4.2, Phase 0). Recommended _when to
  flip_: at MT-flip phase, when session count is known-small.

### D8 — Build org-RBAC now vs later

- **A (recommended): Ship MT-0 seams now (Phase 0, reversible); build the RBAC flip (verified
  principal in the internal token, CP-side resolver) as a deliberate later phase; do the
  irreversible PK/encryption rebuilds last.**
- B: Build full org-RBAC + per-tenant secrets/encryption in one pass now.
- **Constraint:** _the absent-server-side-authorization gap (any direct CP call lists/deletes
  everyone's data) is real and should close, but the irreversible pieces (`global_secrets` PK
  rebuild, per-tenant encryption) are one-way and shouldn't be rushed._ A sequences the cheap
  reversible seams (no-op columns, ignored params) ahead of the deliberate flip ahead of the one-way
  rebuilds — matching the data-supported staging. B front-loads irreversible cost before the
  boundary is exercised. **The irreversible secret/encryption pieces additionally depend on D11
  (credential-ownership model).**

### D9 — OpenCode-agents scope

- **A (recommended): Backend threading + permission fix + event-protocol propagation for primary
  agents and subagents, host-fixed agent registry first; org/user-configurable agents later.**
- B: Primary-agent selection only (Build/Plan), no subagent rendering.
- C: Full (agents + subagents + per-agent model + org-configurable agents) in one pass.
- **Constraint:** _agents are orthogonal to the SDK migration and the wire-protocol fields are
  additive, but the permission fix is a global behavior change (not default-off) and subagent
  rendering is a joint backend+UI lift (new `agent`/`mode`/SubtaskPart event fields) — "real"
  Build-vs-Plan needs the blanket `permission:{"_":{"_":"allow"}}` removed (`entrypoint.py:809`) as
  its own cohort-gated sub-step (Phase OC-AC-perm)._ A captures the high-value 80% (selector +
  per-agent model + the permission fix, staged as its own gated step) while staging the heavier
  subagent-timeline and org-config slices. B under-delivers (no subagent visibility, the main
  differentiator); C over-commits before the permission/event-protocol changes are proven. **The
  selection _scope_ (per-session vs per-prompt) is its own product fork — see D13.**

### D10 — How much UI in `packages/ui` vs `apps/orto`

- **A (recommended): Reuse the unused `@orthogonal/ui/ai` kit aggressively; keep analytics/admin/org
  components app-local in `apps/orto`; promote to `packages/ui` only genuinely reusable primitives
  (optional `AgentBadge`, a generic `DataTable` only if both members + users tables want it).**
- B: Promote everything new to `packages/ui`.
- **Constraint:** _every `packages/ui` component must ship co-located `.stories.tsx` + `.test.tsx`
  (a real per-component tax), and the biggest lever is migrating the prompt box to the
  already-built-but-unused shared `Composer`/`SlashCommandPopover`/`Task`/`Tool` — not building new
  shared components._ A minimizes new shared-component cost and front-loads the composer migration
  (the shared prereq for both slash commands and agents UI). B pays the stories+tests tax on
  components that may never be reused outside orto.

### D11 — BYOK credential-ownership model (a security/product/trust fork, not a resolution detail)

- **A: Platform-holds-all-keys.** One platform-owned set of provider credentials; the gateway (or
  env injection) uses them for every tenant. Simplest; the platform pays and meters; no per-tenant
  secret store.
- **B: Tenant-BYOK.** Each tenant supplies its own provider keys, stored per-tenant (encrypted,
  scoped). Requires the `global_secrets` PK rebuild → `PRIMARY KEY (tenant_id, key)` and per-tenant
  encryption (§4.4, §4.5 — the one-way migrations).
- **C: Per-tenant OAuth-minted.** The platform mints/holds per-tenant OAuth credentials (e.g. via
  the GitHub-App-style install flow) rather than static keys.
- **Constraint (recommendation: A as the single-tenant default; B only when a real tenant requires
  its own billing/keys):** _this is a genuine security/product/trust decision whose irreversible
  data-model consequences — the `global_secrets` PK rebuild and per-tenant encryption (§4.5 #2/#3) —
  hang off it, and it was previously buried as a server-side "resolution detail."_ Pick A while
  single-tenant (no secret-store rebuild, no per-tenant encryption); commit to B/C only when a
  tenant genuinely needs its own credentials/billing, since B/C force the one-way migrations.
  **Downstream of `D-gateway` for the metered/priced path, and the forcing function for Phase
  MT-rebuild's irreversible pieces.**

### D12 — Per-tenant OpenCode config delivery mechanism

- **A (recommended default): `OPENCODE_CONFIG_CONTENT` inline injection.** Verified seam at
  `entrypoint.py:834` (FACT); merge tenant `command`/`agent` config into the config dict per
  session. No dependency on the gateway or on unverified OpenCode fetch behavior;
  single-tenant-compatible today.
- **B: `.well-known/opencode` remote config (precedence #1) — contingent optimization [PROPOSED —
  pending D-gateway].** A central endpoint (dovetailing with the gateway Worker) serving per-tenant
  config keyed on the token's `sid`/`tenant`.
- **Constraint:** _it is **UNCERTAIN and unverified** whether OpenCode fetches
  `.well-known/opencode` **with custom auth headers** (`cb-commands` flag); if it does not, the
  `.well-known`-based per-tenant catalog is unworkable and must fall back to
  `OPENCODE_CONFIG_CONTENT`._ Lead with A as the safe default; treat B as an optimization
  **contingent on verifying auth-header support** (and on `D-gateway`, since the central endpoint is
  the gateway Worker). This is an architectural fork, not interim-vs-final sequencing.

### D13 — OpenCode agent selection scope (a PRODUCT choice — both supported)

- **A: Per-session default.** A session picks one agent at creation; all prompts in the session use
  it (mirrors how a session picks one `model` today).
- **B: Per-prompt override.** Each prompt may name its own agent (the assistant record stamps
  `agent` per message — **C7**); the session default is just a fallback.
- **Constraint (recommendation: ship A first, add B incrementally — both are cheap once `agent` is
  threaded):** _the dossier marks this explicitly a PRODUCT choice — both per-session-default and
  per-prompt-override are supported by OpenCode — so it is a product decision, not a technical
  constraint._ Threading `agent` through the wire protocol (§6.3 #1–3) enables both; A is the
  simpler UX and matches today's `model` mental model; B is strictly additive on top. Surface it as
  a deliberate product fork rather than asserting "per-session default + per-prompt override" as
  settled.

### D14 — Metering reconciliation granularity (downstream of the `message_id` problem)

- **A: Session-level-only reconciliation.** Join gateway ledger rows to the sandbox ticker on
  `session_id` (the JWT `sid` — **always observable gateway-side**). Drift/reconcile is per-session,
  not per-message. Lowest risk, always implementable.
- **B: Gateway-minted correlation id.** The gateway mints a correlation id per inference call that
  OpenCode echoes back into its `step_finish`/message record, enabling a per-call join without
  relying on `message_id`. Requires an OpenCode-side echo mechanism (verify it exists / can be
  added).
- **C: Live-only, unreconciled.** Treat the sandbox ticker as a UI-only live estimate and the
  gateway ledger as the sole durable/billable source — **no merge at all** between the two.
- **Constraint (recommendation: A as the safe default; C if the ticker is acceptable as merely-live;
  B only if a verified echo mechanism exists):** _the intended `(session_id, message_id)`
  per-message join is **UNVERIFIED and load-bearing** — the gateway's trusted JWT keys are
  `tenant`/`sid`/`model` only, and it is **not established** that OpenCode's internal `message_id`
  appears in the upstream provider request the gateway proxies (§3.2). If it doesn't, the
  per-message join is unimplementable._ A always works (`session_id` is in the JWT); C avoids
  reconciliation entirely; B recovers per-call granularity only if OpenCode can echo a
  gateway-minted id. **Downstream of `D-gateway` (no gateway → no second source to reconcile) and of
  D6-A.**
