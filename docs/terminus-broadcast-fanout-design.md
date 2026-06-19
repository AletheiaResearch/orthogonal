# Terminus broadcast fan-out — design (CON-73, folds CON-54)

> Status: **proposed** — awaiting Nejc's review. Spec-driven per `docs/terminus-llm-gateway.md`.
> Branch: `nejc/con-73-broadcast-fanout`. Lands on `terminus`.

## 1. Goal

Give Terminus a **configurable, multi-destination emission fan-out**: every completed LLM call
produces one canonical record that is fanned out, fire-and-forget, to zero-or-more
operator-configured destinations (analytics, observability, object storage, a metrics DB, a custom
webhook). Destinations are added, toggled, sampled, and re-credentialled **at runtime** (no
redeploy) — this is the literal answer to "the DB is just one configurable destination, why would a
DB choice block us."

This **unifies two issues**:

- **CON-54 (usage metering)** — the durable usage/cost sink that `usage/sink.ts` deliberately
  deferred ("until a metrics store is chosen") becomes _one destination among many_. No store is
  privileged; no store choice blocks the seam.
- **CON-73 (broadcast)** — the multi-destination fan-out itself.

It builds directly on the already-merged seams: the **usage seam** (`usage/sink.ts`, CON-54) and the
**trace content-capture seam** (`trace/sink.ts`, CON-61). See
[`terminus-trace-capture-design.md`](terminus-trace-capture-design.md).

### Non-goals (explicit)

- **PII sanitization is OPTIONAL and out of the critical path.** Content capture stays default-OFF
  (`TERMINUS_TRACE_CAPTURE_ENABLED`); the sanitizer is a _pluggable per-destination transform_
  (CON-43), not a blocker for this work. Metrics-only fan-out works with content OFF.
- **No durable in-Worker batching.** Per-call fire-and-forget only. If batching is ever needed it
  belongs on a Durable Object or Cloudflare Queue, never an in-isolate array (see §9).
- **The CON-42 dashboard** is a _downstream destination_, not built here.
- **Per-session consent UI** lands with CON-43; here we only honor the coarse operator flag.

## 2. Prior art (why this shape)

Four independent, source-verified references converge on the _same_ architecture. Full extraction in
the research notes; summary:

| Source                           | Fan-out shape                                                                                                                                                     | Key transfer                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **OpenRouter Broadcast** (docs)  | per-call async emitter → N runtime-configured destinations; per-dest `{enabled, samplingRate, privacyMode, apiKeyFilter, encrypted creds}`; Test-Connection probe | the config model + the OTLP-vs-proprietary split             |
| **LiteLLM** (OSS, verbatim)      | one `StandardLoggingPayload` built once → iterate callback list; per-callback try/except; per-callback sampling + redaction                                       | the canonical-record-then-fan-out + adapter interface        |
| **Helicone** (OSS, verbatim)     | chain-of-responsibility adapters; best-effort dispatch; per-dest config row (JSONB); SSRF guard; HMAC; truncation/externalize                                     | SSRF guard, HMAC, data-minimization, config-as-DB-row        |
| **Cloudflare AI Gateway** (docs) | managed fan-out by config-list; per-exporter `{url, headers, auth-by-ref, json\|protobuf}`; OTLP/JSON default                                                     | OTLP/JSON-over-fetch is the precedent-blessed, SDK-free wire |

Two Worker-specific divergences we adopt deliberately: **fan-out runs _inline_ in the Worker via
`waitUntil`** (Helicone moved it off-edge to a Node queue — we accept the subrequest-limit tradeoff,
§9); and **no protobuf** (we ship OTLP/JSON only — affects W&B, §8).

## 3. Architecture

```
                       ┌─────────────────────────────────────────────┐
  chat.ts  ──build──►  │  EmissionRecord  (canonical, built ONCE)     │
 (emit point)          │  ├─ metrics  (ALWAYS: model, provider,       │
                       │  │            tokens, costUsd, latencyMs,     │
                       │  │            traceId, sessionId, finish…)    │
                       │  └─ content? (OPTIONAL: messages, response,   │
                       │              toolCalls — gated + sanitized)   │
                       └───────────────┬─────────────────────────────┘
                                       │ ctx.waitUntil(  Promise.allSettled( … ) )
                          ┌────────────┴───────────────┐
                          ▼  BroadcastDispatcher (registry of enabled destinations)
        ┌─────────┬─────────────┬──────────────┬──────────────┬─────────────┐
        ▼         ▼             ▼              ▼              ▼             ▼
   OtlpDest   PostHogDest   R2Dest      WebhookDest   LangfuseDest   …(per-adapter)
   (shared    (proprietary  (R2 native  (generic +    (proprietary)
    OTLP/JSON  $ai_*)        binding)    HMAC + SSRF)
    serializer)
```

Three layers, each independently testable:

1. **The canonical record** (`EmissionRecord`) — built once at the existing emit point, _composed_
   from the data the chat handler already has (never re-derived per destination).
2. **The dispatcher** (`BroadcastDispatcher`) — resolves the enabled destination set from runtime
   config, applies per-destination sampling/filtering, and fans out with `Promise.allSettled` inside
   a single `ctx.waitUntil`. One destination failing/timing-out can never reject the others or fail
   the call.
3. **The destinations** (`BroadcastDestination` adapters) — each maps the canonical record to its
   wire shape and POSTs it. Two families behind one interface: a **shared OTLP/JSON serializer**
   (generic OTLP, and OTLP-mode of Langfuse/PostHog/W&B) and **proprietary adapters** (PostHog
   capture, LangSmith, Langfuse native, Datadog, R2/S3, ClickHouse).

### Where it slots in

The dispatcher is injected as a new optional dependency and dispatched at the **same emit point** as
usage/trace today (`routes/chat.ts`), alongside the existing `emit()`/`captureTrace()` closures.
`index.ts` constructs it (default = empty registry = no-op) exactly like `usageSink`/`traceSink`:

```ts
// index.ts (sketch)
const broadcast = deps.broadcast ?? buildBroadcastDispatcher(/* resolves config from env.DB */);
// …passed into chatCompletions(c, { …, broadcast })
```

**Correction to an earlier assumption:** this is _not_ a zero-call-site-change swap. `chat.ts` must
change — additively — to (a) measure latency, (b) generate a trace id, (c) always extract the finish
reason, (d) dispatch the record. See §5.

### End-state (stated, not built in Phase 1)

Once the registry exists, the deferred CON-54 timeseries sink and the CON-61 content store are _just
destinations_ (a "metrics-db" destination; a "trace-store" destination). Phase 1 leaves the existing
`UsageSink` (structured-log) and `TraceSink` (CON-61) seams intact and adds the broadcast as a
third, independent, default-empty seam. Collapsing them into registry destinations is a later
cleanup, not this PR.

## 4. The canonical record

One record, two tiers. Built once; the same object is handed to every destination.

```ts
interface EmissionMetrics {
  traceId: string; // 16 random bytes, lowercase hex (32 chars) — OTLP-native (see §5)
  sessionId: string; // UsageRecord.sid (gateway-token claim; attribution key)
  tenant: string | null; // UsageRecord.tenant
  model: string; // provider-qualified, e.g. "anthropic/claude-opus-4-5"
  provider: string; // DERIVED: model.split("/")[0] (UsageRecord has no provider field)
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number; // gateway-computed (only the gateway holds pricing)
  latencyMs: number; // upstream-request → upstream-finish (NOT client pull time, §5)
  ttftMs?: number; // optional time-to-first-token (streaming)
  finishReason: string | undefined; // raw AI-SDK reason, always extracted
  createdAt: number; // epoch ms (= UsageRecord.createdAt)
}

interface EmissionContent {
  // present ONLY when trace capture is on
  requestMessages: OpenAIChatMessage[];
  responseText: string;
  responseToolCalls: TraceToolCall[];
}

interface EmissionRecord {
  metrics: EmissionMetrics; // always
  content?: EmissionContent; // optional, gated default-OFF, sanitized per-destination
}
```

Construction is a pure
`toEmissionRecord(usageRecord, { latencyMs, ttftMs, traceId, finishReason }, content?)` — it
**composes** the already-built `UsageRecord` plus the new metric fields plus the optional content
slice. It does not re-parse the model response. This preserves the "build once, fan out" invariant.

**Metrics carry no PII** and are always emitted (a billing/PostHog-metrics destination needs no
content). **Content carries raw, unsanitized PII** (per `trace/sink.ts`) and is attached only when
`TERMINUS_TRACE_CAPTURE_ENABLED` is on; each content-consuming destination runs the optional
sanitizer before serialization (§7).

## 5. `chat.ts` changes (additive)

Four additive changes at the existing emit point — both response paths share one emit closure today,
so the new dispatch lives there too:

1. **Latency.** Capture `startedAtMs` immediately before the upstream call begins (`streamText(...)`
   / `generateText(...)`), and compute `latencyMs = now() - startedAtMs` **at the upstream `finish`
   boundary** — the usage/finish callback for streaming, the awaited result for non-streaming.
   - **Streaming trap (called out):** usage/finish on the committed SSE stream fires _after the
     client pulls_. `latencyMs` must be measured to the **upstream finish part**, not to stream
     drain, or it degrades into "client read rate." The CON-74 peek/drain
     (`routes/stream-fallback.ts`) makes this boundary subtle — define and test it explicitly.
   - Honor the unit-in-name convention: `latencyMs`, `startedAtMs`, `ttftMs`.
2. **Trace id.** Generate once per request: **16 random bytes, lowercase-hex (32 chars)**, via
   `deps.newId`-injectable source. _Not_ `crypto.randomUUID()` — OTLP, Langfuse-OTLP, and W&B all
   require a 16-byte trace id; a hex-16 string is directly OTLP-usable and fine as a string for
   every proprietary adapter. (The `chatcmpl-…` response id stays a UUID; the trace id is separate.)
3. **Finish reason.** Always extract it (cheap; today it is only computed on the gated trace path).
   It is a metrics-tier field.
4. **Dispatch.** Build the `EmissionRecord` and hand it to
   `broadcast.dispatch(record, c.executionCtx)`, which itself wraps the fan-out in `waitUntil` +
   `Promise.allSettled`. Default empty registry → no work, zero overhead.

These compose with the existing `emit()`/`captureTrace()` closures; we reuse the same
`usageRecord(...)` the handler already builds.

## 6. The destination interface & dispatcher

```ts
interface BroadcastDestination {
  readonly id: string;
  readonly type: string; // "otlp" | "posthog" | "r2" | "webhook" | …
  /** Map the canonical record to this destination's wire shape and POST it. Must never throw. */
  send(record: EmissionRecord, signal: AbortSignal): Promise<void>;
  /** Minimal reachability+auth probe for the admin "test connection" action. */
  testConnection(): Promise<{ ok: boolean; status?: number; error?: string }>;
}
```

The **dispatcher**:

- Resolves the **enabled** destinations from runtime config (§7) per request.
- For each: applies **deterministic per-destination sampling** — `hash(traceId) < samplingRate` (not
  `Math.random()`), so the _same_ trace is consistently in/out of a given destination and
  independent across destinations (billing at 1.0, debug at 0.05). Applies **event-type filter**
  (success/failure) and **property filters**.
- Fans out:
  `ctx.waitUntil(Promise.allSettled(dests.map(d => withTimeout(d.send(record, signal)))))`. Each
  `send` is independently try/caught with an `AbortController` timeout (a few seconds). A rejection
  only logs (per-destination delivery counter / `console.error`) — it never propagates.

**OTLP family vs proprietary** — one canonical record in, per-destination serializer out:

- **OTLP/JSON serializer (shared):** generic OTLP collectors + the OTLP mode of Langfuse, PostHog,
  W&B. Emits `gen_ai.*` GenAI-semantic-convention spans (proto3-JSON: int enums, int64 as decimal
  strings, 32-hex trace id / 16-hex span id, typed `AnyValue`). Cost → vendor-namespaced
  `terminus.cost.usd`; finish reason → `gen_ai.response.finish_reasons` (array); latency = span
  duration; session → `gen_ai.conversation.id`.
- **Proprietary adapters:** each transforms the canonical record into the vendor JSON (§8).

## 7. Runtime config & storage

**Storage: D1**, mirroring `provider_credentials` (`db/schema.ts`) — the transactional, already-used
pattern. KV is rejected (eventually-consistent; "configurable mid-runtime" wants read-after-write).

New table `broadcast_destinations` (owner-scoped, same `owner_type`/`owner_id` model as
credentials):

| column                              | type        | purpose                                                                                                                                                         |
| ----------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                | text PK     |                                                                                                                                                                 |
| `owner_type` / `owner_id`           | text        | `platform` (single-tenant) / BYOK                                                                                                                               |
| `type`                              | text        | adapter discriminator (`otlp`/`posthog`/`r2`/`webhook`/…)                                                                                                       |
| `enabled`                           | bool        | toggle without delete                                                                                                                                           |
| `config`                            | text (JSON) | non-secret per-dest config: endpoint/host/region, headers, `samplingRate` (0–1), `includeContent` (bool), `privacy` mode, `propertyFilters`, `eventTypes`       |
| `secret_encrypted`                  | text        | AES-256-GCM creds (api key / S3 keys / HMAC key), **reusing `encryptSecret`/`decryptSecret` from `@open-inspect/shared`** with owner-as-AAD — same as the vault |
| `label`, `created_at`, `updated_at` |             | mirror credentials                                                                                                                                              |

Generated via `drizzle-kit generate` into `services/terminus/migrations/`; auto-applied in tests
(`readD1Migrations`/`applyD1Migrations`) and prod (terraform `null_resource.terminus_d1_migrations`,
sha-triggered). A `DestinationStore` class mirrors `CredentialVault` (owner-scoped CRUD, decrypt
in-isolate only, public metadata never includes the secret).

**Admin API** — extend the existing `/admin` app (`routes/admin.ts`, constant-time bearer on
`TERMINUS_ADMIN_SECRET`), adding routes parallel to the credential/policy CRUD:

| method   | path                           | purpose                                                |
| -------- | ------------------------------ | ------------------------------------------------------ |
| `POST`   | `/admin/destinations`          | create a destination (type + config + creds)           |
| `GET`    | `/admin/destinations`          | list (metadata only, never secrets)                    |
| `PATCH`  | `/admin/destinations/:id`      | toggle `enabled` / update config                       |
| `DELETE` | `/admin/destinations/:id`      | remove                                                 |
| `POST`   | `/admin/destinations/:id/test` | run `testConnection()` — validate before relying on it |

Bootstrap path for standalone Terminus: same as credentials — env-seed + admin API. Flagship can
gate destination enablement later.

## 8. Per-destination adapters

Distilled from the source-verified research (LiteLLM/Helicone OSS + official docs). Each adapter is
a pure `record → wire` map + a `fetch`. **Phase tag** in the last column (§10).

### OTLP/JSON (generic) — _Phase 1_

`POST {endpoint}/v1/traces`, `Content-Type: application/json`. Per-backend auth menu (Bearer / Basic
via `btoa` / `x-honeycomb-team` / `api-key`). `gen_ai.*` spans, proto3-JSON encoding (int enums,
int64-as-string, 32-hex traceId, typed AnyValue). `gen_ai.provider.name`, `gen_ai.request.model` +
`gen_ai.response.model`, `gen_ai.usage.input_tokens`/`output_tokens`,
`gen_ai.response.finish_reasons` (array), `gen_ai.conversation.id` (session); **cost →
`terminus.cost.usd`** (not standard); latency = span duration; messages → `gen_ai.input.messages` /
`gen_ai.output.messages` (Opt-In). 200 may carry `partial_success` — log, never fail.

### PostHog (capture API) — _Phase 1_

`POST {host}/i/v0/e/` (single) or `/batch/` (fan-out). **No auth header — project key (`phc_…`) goes
in the JSON body field `api_key`.** Event `$ai_generation`. Props (inside `properties`): **split**
`$ai_model` (bare) + `$ai_provider`; `$ai_input_tokens`/`$ai_output_tokens`;
**`$ai_total_cost_usd`** (we set it → overrides PostHog auto-calc); **`$ai_latency` in SECONDS
(divide ms by 1000)**; **`$ai_stop_reason`** (NOT `$ai_finish_reason`); `$ai_trace_id`;
`$ai_session_id`; optional `$ai_input` / `$ai_output_choices` (array of `{role,content}`). `host`
runtime-configurable (us/eu/self-host). LiteLLM `posthog.py` is the reference. _Gotcha: no
`$ai_total_tokens`; omit it._

### R2 / S3 (object storage) — _Phase 1 (R2-native binding)_

**Path A (Phase 1): R2 native binding** `await env.BUCKET.put(key, body, opts)` — no creds, no
signing, Worker-local. **Path B (later): S3 SigV4 over `fetch`** via `crypto.subtle` (HMAC-SHA256 +
SHA-256) for external/customer buckets. One JSON object per trace (`Content-Type: application/json`,
optional `Content-Encoding: gzip` via `CompressionStream`). Date-partitioned key
`traces/{tenant|_}/{YYYY}/{MM}/{DD}/{sessionId}/{traceId}.json` (traceId guarantees uniqueness).
LiteLLM `s3_v2.py` (manual SigV4 over fetch) proves the no-SDK path; Helicone proves gzip + key
hierarchy. Requires an R2 bucket binding in `workers-terminus.tf` (terraform module already supports
`r2_buckets`).

### Generic webhook — _Phase 1_

`POST {url}` JSON body = the canonical record (or a small metric subset). **HMAC-SHA256 signature**
over the body via `crypto.subtle`, sent as a signature header (Helicone-style). **SSRF guard
(non-optional):** HTTPS-only + reject localhost/0.0.0.0, private IPv4 (10/8, 172.16–31, 192.168/16),
link-local 169.254/16, cloud-metadata IPs, and `.local/.internal/.corp/.lan` suffixes. Body
truncation at a size cap when content is included.

### LangSmith — _Phase 2_

`POST /api/v1/runs/batch` body `{post:[run]}`. Auth `x-api-key` (NOT Bearer; `lsv2_pk_…`). Run with
`run_type:"llm"`; **`extra.metadata.ls_model_name` + `ls_provider` are REQUIRED** for model/cost id;
`trace_id == id` and `dotted_order = strftime("%Y%m%dT%H%M%S%fZ", start) + id` for a standalone run;
ISO-8601 timestamps (latency derived from start/end); `inputs.messages` / `outputs.choices[]`.
LiteLLM `langsmith.py` reference. _Our computed cost has no native field → stash in
`extra.metadata`._

### Langfuse — _Phase 2_

**Native batch (recommended):** `POST /api/public/ingestion` body
`{batch:[trace-create, generation-create]}`. Basic auth `btoa(pk:sk)` (`pk-lf-…:sk-lf-…`). Use the
split **`usageDetails`** (`{input,output,total}` ints) + **`costDetails`** (`{input,output,total}`
USD — send our computed cost). String ids (no OTLP hex/nanosecond ceremony). Generation `id` must
differ from trace `id`. Region base URL must match the keys. (OTLP mode also available via the
shared serializer → `/api/public/otel/v1/traces`.) LiteLLM `langfuse.py` reference.

### Datadog LLM Observability — _Phase 2_

`POST https://api.{DD_SITE}/api/intake/llm-obs/v1/trace/spans`. Header **`DD-API-KEY`** (raw key,
colon, not Bearer). Proprietary span JSON
`{data:{type:"span",attributes:{ml_app, tags, spans:[…]}}}`. **`start_ns`/`duration` in
NANOSECONDS** (`latencyMs * 1e6`). **`model_name` nested at `meta.metadata.model_name`** (not
`meta.model_name`). `metrics` floats (`input_tokens`, `total_cost`…). `ml_app` REQUIRED. Success =
**HTTP 202, empty body**. Keep payload < 1 MB (spans

> 1 MB silently dropped). LiteLLM `datadog_llm_obs.py` reference.

### ClickHouse — _Deferred (batching)_

HTTP interface `POST /?query=INSERT … FORMAT JSONEachRow&async_insert=1&wait_for_async_insert=0`,
Basic auth via `btoa` or `X-ClickHouse-User`/`-Key`, NDJSON body. **`async_insert=1` is effectively
required** — per-call single-row inserts trigger "too many parts" (code 252). Even Helicone does
_not_ insert per-call from its edge Worker (it queues to a Node service). Our schema would model
Helicone's `request_response_rmt` + add `finish_reason`/`trace_id`/`session_id` columns (gaps in
both Helicone and LiteLLM). **Deferred** because it fights the per-call fire-and-forget model;
correct home is a Queue/DO consumer (§9). Also: Workers outbound to `:8443`/`:8123` needs an egress
check.

### Weights & Biases (Weave) — _Deferred (protobuf-only)_

`POST https://trace.wandb.ai/otel/v1/traces`, Basic auth `btoa("api:"+key)` + `project_id` header.
**Body is OTLP _protobuf_ (`application/x-protobuf`), JSON is most likely rejected** — collides with
our explicit "no protobuf encoder" constraint. **Deferred** pending either a minimal protobuf writer
or a build-time check that the endpoint accepts OTLP/JSON. Also: **cost has no Weave attribute**
(custom attr only). LiteLLM `weave_otel.py` (PR #17439) reference.

## 9. Worker constraints & limits

- **Transport:** plain `fetch()` + `btoa()` + `crypto.subtle` only. No gRPC, no vendor SDKs, no
  protobuf encoder. OTLP/JSON (not protobuf) for every OTLP-family destination.
- **Subrequest ceiling:** 50 (free) / 1000 (paid) subrequests per invocation. N destinations = N
  subrequests/call — fine at this scale. This is _why_ any future batching must live on a Durable
  Object or Cloudflare Queue, not an in-isolate array (a request-scoped isolate is evicted; module
  globals don't persist). Helicone moved fan-out off-edge for exactly this reason.
- **Best-effort everywhere:** dispatch in `ctx.waitUntil`, `Promise.allSettled`, per-`send`
  try/catch + `AbortController` timeout. A destination error logs; it never adds latency and never
  fails the LLM call. (Matches the `LoggingUsageSink`/`NoopTraceSink` "must never throw" contract.)
- **Credentials** encrypted at rest (reuse `encryptSecret`/`decryptSecret`), decrypted only in
  isolate at send time. SSRF guard on every URL/webhook destination is non-optional.

## 10. Phasing — **the decision for Nejc**

8 destinations + framework + D1 + admin + SSRF + HMAC + sampling + sanitizer + test-connection +
terraform is more than one reviewable PR. Proposed cut (one PR = Phase 1; the rest fast-follow):

- **Phase 1 (this PR): the seam end-to-end + a reference set that exercises every concern once.**
  Canonical record + `chat.ts` changes (latency/traceId/finish/dispatch) + dispatcher
  (`allSettled`/`waitUntil`/sampling/filtering) + D1 `broadcast_destinations` + `DestinationStore` +
  admin CRUD + test-connection + SSRF + HMAC + optional sanitizer hook. **Reference adapters:
  generic OTLP/JSON, PostHog capture, R2-native binding, generic webhook** — proves _both_ protocol
  families and every cross-cutting concern.
- **Phase 2 (fast-follow): the clean proprietary adapters** — LangSmith, Langfuse, Datadog. Against
  the now-frozen `BroadcastDestination` interface → ideal **Workflow fan-out** (one agent per
  adapter, TDD).
- **Deferred (own issues): ClickHouse** (needs Queue/DO batching) and **W&B Weave** (needs a
  protobuf path). Both are flagged with the precise blocker above.

## 11. Testing (TDD)

- **Unit, per adapter:** canonical record → exact wire shape. Assert the error-prone details the
  research flagged (PostHog latency-in-seconds + `$ai_stop_reason` + model split; OTLP int64-as-
  string + 32-hex traceId; Datadog ns + nested `model_name` + 202; Langfuse `costDetails`;
  SigV4/HMAC signatures via known vectors).
- **Unit, dispatcher:** `allSettled` isolation (one throwing dest doesn't affect others),
  deterministic sampling (same traceId → stable in/out), event-type/property filtering,
  default-empty = no-op.
- **Unit, record:** `toEmissionRecord` composition (no re-derivation), content gated by capture
  flag, provider-from-model split, latency semantics with an injected clock.
- **Integration (real D1, Miniflare):** `DestinationStore` CRUD + admin routes + `afterEach` table
  cleanup, mirroring `admin.test.ts`. Fake destinations via `createApp({ broadcast })`.
- Fakes use the injectable `now`/`newId` (latency + traceId become deterministic in tests).

## 12. Deployment & safety

- **Default-empty = safe to ship.** Zero configured destinations → the dispatcher is a no-op;
  merging Phase 1 changes nothing operationally until an operator adds a destination via the admin
  API.
- D1 migration auto-applies (terraform sha-trigger). R2-native destination needs a bucket binding in
  `workers-terminus.tf` (module already supports `r2_buckets`) — only when an R2 destination is
  used.
- Content capture stays default-OFF (`TERMINUS_TRACE_CAPTURE_ENABLED`); metrics-only destinations
  are unaffected by it.

## 13. Open decisions (for Nejc's review)

1. **Phase-1 cut (lead question).** OK to land Phase 1 = seam + {OTLP, PostHog, R2, webhook}, with
   LangSmith/Langfuse/Datadog as a fast-follow Workflow and ClickHouse/W&B deferred to their own
   issues? Or do you want a different reference set in the first PR?
2. **W&B protobuf.** Accept deferral, or should I build a minimal OTLP-protobuf writer now?
3. **ClickHouse batching.** Accept deferral to a Queue/DO consumer, or is a per-call `async_insert`
   adapter (accepting the "too many parts" risk) acceptable as an interim?
4. **Latency semantics.** Confirm `latencyMs` = upstream-request-start → upstream-finish-part (not
   client-stream-drain). Also emit `ttftMs` for streaming?
5. **Content tier.** Confirm content stays default-OFF behind `TERMINUS_TRACE_CAPTURE_ENABLED`, with
   the sanitizer as an optional per-destination transform (CON-43), and per-session consent left to
   CON-43.
