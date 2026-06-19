# Terminus broadcast fan-out — design (CON-73, folds CON-54)

> Status: **proposed** — awaiting Nejc's review. Revised once after an adversarial review (codex)
> against the real source. Spec-driven per `docs/terminus-llm-gateway.md`. Branch:
> `nejc/con-73-broadcast-fanout`. Lands on `terminus`.

## 1. Goal

Give Terminus a **configurable, multi-destination emission fan-out**: every completed LLM call
produces one canonical record that is fanned out, fire-and-forget, to zero-or-more
operator-configured destinations (analytics, observability, object storage, a metrics DB, a custom
webhook). Destinations are added, toggled, sampled, and re-credentialled **at runtime** (no
redeploy) — this is the literal answer to "the DB is just one configurable destination, why would a
DB choice block us." (One exception, called out in §8: an R2 _native binding_ is a deploy-time
optimization, not a runtime path — the runtime object-storage path is S3 SigV4.)

This **unifies two issues**:

- **CON-54 (usage metering)** — the durable usage/cost sink that `usage/sink.ts` deliberately
  deferred ("until a metrics store is chosen") becomes _one destination among many_. No store is
  privileged; no store choice blocks the seam.
- **CON-73 (broadcast)** — the multi-destination fan-out itself.

It builds directly on the already-merged seams: the **usage seam** (`usage/sink.ts`, CON-54) and the
**trace content-capture seam** (`trace/sink.ts`, CON-61). See
[`terminus-trace-capture-design.md`](terminus-trace-capture-design.md).

### Non-goals (explicit)

- **PII sanitization is OPTIONAL and out of the critical path** — but raw content is NOT broadcast
  in Phase 1. Content capture stays default-OFF (`TERMINUS_TRACE_CAPTURE_ENABLED`); the sanitizer is
  a _pluggable per-destination transform_ (CON-43), not a blocker for the framework. **Phase 1 is
  metrics-only.** Exporting raw prompts/responses to an external destination is a stronger action
  than CON-61's in-house capture — `trace/sink.ts` requires the sanitizer to run first — so
  `includeContent` is **hard-gated until CON-43** lands (sanitizer + per-session consent). The seam
  _supports_ a content tier so it doesn't have to be re-plumbed later; no destination sets
  `includeContent` until then.
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
  chat.ts  ──build──►  │  EmissionRecord  (canonical, built ONCE      │
 (completion           │                   at the completion boundary)│
  boundary)            │  ├─ metrics  (ALWAYS: model, provider,       │
                       │  │            tokens, costUsd, latency,       │
                       │  │            traceId, sessionId, finish…)    │
                       │  └─ content? (gated OFF until CON-43:         │
                       │              messages, response, toolCalls)   │
                       └───────────────┬─────────────────────────────┘
                                       │ dispatch() → ctx.waitUntil( Promise.allSettled( … ) )
                          ┌────────────┴───────────────┐
                          ▼  BroadcastDispatcher (registry of enabled destinations)
        ┌─────────────┬──────────────┬──────────────┬───────────────────────────┐
        ▼             ▼              ▼              ▼                            ▼
   OtlpDest      PostHogDest    WebhookDest    …Phase 2:                   (frozen
   (shared       (proprietary   (generic +      S3/SigV4, Langfuse,        interface)
    OTLP/JSON     $ai_*)         HMAC + SSRF)    LangSmith, Datadog
    serializer)
```

Three layers, each independently testable:

1. **The canonical record** (`EmissionRecord`) — built once at the completion boundary, _composed_
   from the data the chat handler already has (never re-derived per destination).
2. **The dispatcher** (`BroadcastDispatcher`) — `dispatch()` is **synchronous/void**: it resolves
   the enabled destination set from runtime config, applies per-destination sampling/filtering, and
   fans out with `Promise.allSettled` — all inside a single `ctx.waitUntil`, never awaited by the
   route. One destination failing/timing-out can never reject the others, add latency, or fail the
   call.
3. **The destinations** (`BroadcastDestination` adapters) — each maps the canonical record to its
   wire shape and POSTs it. Two families behind one interface: a **shared OTLP/JSON serializer**
   (generic OTLP, and OTLP-mode of Langfuse/PostHog/W&B) and **proprietary adapters** (PostHog
   capture, LangSmith, Langfuse native, Datadog, S3, ClickHouse).

### Where it slots in (corrected)

**There is no single unified emit point today.** `emit()` (chat.ts ~157) receives only usage;
`captureTrace()` (chat.ts ~214) separately rebuilds a `UsageRecord` from the completion parts; and
on the streaming path usage (`onUsage`) fires _before_ content (`onComplete`) in
`openai/protocol.ts`. So Phase 1 **introduces one completion helper** at the `onComplete`/result
boundary that builds the `UsageRecord` **once** and fans it out to the usage sink, the trace sink,
_and_ the broadcast dispatcher. `index.ts` constructs the dispatcher (default = empty registry =
no-op) exactly like `usageSink`/`traceSink`:

```ts
// index.ts (sketch)
const broadcast = deps.broadcast ?? buildBroadcastDispatcher(/* resolves config from env.DB */);
// …passed into chatCompletions(c, { …, broadcast })
```

This is **not** a zero-call-site-change swap. `chat.ts` changes additively (§5): measure span
timing, generate a trace id, always extract the finish reason, dispatch.

### End-state (stated, not built in Phase 1)

Once the registry exists, the deferred CON-54 timeseries sink and the CON-61 content store are _just
destinations_. Phase 1 leaves the existing `UsageSink` (structured-log) and `TraceSink` (CON-61)
seams intact and adds the broadcast as a third, independent, default-empty seam. Collapsing them
into registry destinations is a later cleanup, not this PR.

## 4. The canonical record

One record, two tiers. Built once; the same object is handed to every destination.

```ts
interface EmissionMetrics {
  traceId: string; // 16 random bytes, lowercase hex (32 chars) — OTLP-native (§5)
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
  costUsd: number; // gateway-computed TOTAL (only the gateway holds pricing). Per-direction
  //          input/output split is a deferred enhancement (§8 Langfuse); we forward total.
  startedAtMs: number; // upstream attempt START (epoch ms) → OTLP span start
  finishedAtMs: number; // upstream attempt FINISH (epoch ms) → OTLP span end. Streaming caveat §5.
  latencyMs: number; // finishedAtMs − startedAtMs. Non-streaming = true upstream duration;
  //           streaming = client-pull-observed (NOT true upstream finish — §5).
  ttftMs?: number; // time-to-first-token, measured at the CON-74 first-chunk peek —
  //          the real server-side upstream-latency signal for streaming.
  finishReason: string | undefined; // raw AI-SDK reason, always extracted
}

interface EmissionContent {
  // gated OFF until CON-43 (sanitizer + consent); no Phase-1 destination sets includeContent
  requestMessages: OpenAIChatMessage[];
  responseText: string;
  responseToolCalls: TraceToolCall[];
}

interface EmissionRecord {
  metrics: EmissionMetrics; // always
  content?: EmissionContent; // gated; see §1 non-goals
}
```

Construction is a pure
`toEmissionRecord(usageRecord, { startedAtMs, finishedAtMs, ttftMs, traceId, finishReason }, content?)`
— it **composes** the already-built `UsageRecord` plus the new fields plus the optional content
slice. It does not re-parse the model response. This preserves the "build once, fan out" invariant.

**Span timing is explicit** (`startedAtMs`/`finishedAtMs`), _not_ `UsageRecord.createdAt` —
`createdAt` is captured before the upstream call (chat.ts ~129) and would mis-time an OTLP span.
OTLP adapters use the two timestamps directly; non-OTLP adapters use `latencyMs`.

**Metrics carry no PII** and are always emitted (a billing/PostHog-metrics destination needs no
content). **Content carries raw, unsanitized PII** (per `trace/sink.ts`) and is therefore **not
attached in Phase 1**; the field exists so the content tier need not be re-plumbed when CON-43
lands.

## 5. `chat.ts` changes (additive)

Phase 1 **introduces a single completion helper** (there is no unified emit point today, §3) and
makes four additive changes there:

1. **Span timing.** Capture `startedAtMs` immediately before the upstream call begins
   (`streamText(...)` / `generateText(...)`); capture `finishedAtMs` at the completion boundary.
   - **Non-streaming:** `finishedAtMs` is the awaited `generateText` result → `latencyMs` is the
     true upstream duration.
   - **Streaming caveat (codex-confirmed):** the upstream `finish` part is consumed _lazily as the
     client pulls_ the committed SSE stream (`routes/stream-fallback.ts` pull path →
     `openai/protocol.ts` `for await`). So a `finishedAtMs` taken at `onComplete` **includes client
     backpressure** — it is not true upstream-finish. We therefore **define streaming `latencyMs` as
     client-pull-observed total** and capture **`ttftMs` at the first-chunk peek** as the real
     server-side upstream signal. (Measuring true upstream-finish would require buffering the entire
     upstream response server-side, defeating CON-74's lazy passthrough — explicitly rejected.)
   - Unit-in-name convention: `startedAtMs`, `finishedAtMs`, `latencyMs`, `ttftMs`.
2. **Trace id.** Generate once per request: **16 random bytes, lowercase-hex (32 chars)**, via a
   **new `deps.newTraceId` injectable** — distinct from `deps.newId`, which is already used for the
   `chatcmpl-…` response-id suffix (chat.ts ~69, ~129). OTLP / Langfuse-OTLP / W&B all require a
   16-byte trace id; a hex-16 string is directly OTLP-usable and fine as a string for every
   proprietary adapter. (OTLP also needs an 8-byte span id — the serializer derives one.)
3. **Finish reason.** Always extract it (cheap; today only computed on the gated trace path). It is
   a metrics-tier field.
4. **Dispatch.** `broadcast.dispatch(record, c.executionCtx)` — **returns `void` synchronously** and
   schedules _all_ work (config lookup, decryption, sends) inside one guarded `waitUntil`. It is
   **never awaited** by the route (unlike today's non-streaming usage emit, which is awaited at
   chat.ts ~316) — so per-request D1 reads + decryption add zero latency to the response. Default
   empty registry → no work.

## 6. The destination interface & dispatcher

```ts
interface BroadcastDestination {
  readonly id: string;
  readonly type: string; // "otlp" | "posthog" | "webhook" | "s3" | …
  /** Map the canonical record to this destination's wire shape and POST it. Must never throw. */
  send(record: EmissionRecord, signal: AbortSignal): Promise<void>;
  /** Minimal reachability+auth probe for the admin "test connection" action. */
  testConnection(): Promise<{ ok: boolean; status?: number; error?: string }>;
}

interface BroadcastDispatcher {
  /** Synchronous/void: schedules ALL fan-out work in ctx.waitUntil; never awaited. */
  dispatch(record: EmissionRecord, ctx: ExecutionContext): void;
}
```

`dispatch()` schedules **one** guarded promise into `ctx.waitUntil`; inside it:

- **Resolve** the enabled destinations from runtime config (§7) — the D1 read + credential
  decryption happen _here_, off the response path.
- **Sample** per destination, deterministically per `(destination, trace)`:
  `hash(destinationId + ":" + traceId) < samplingRate`. Hashing the destination id **and** trace id
  (not the trace id alone) keeps destinations _independent_ — two destinations at the same rate do
  not select the identical trace set — while staying stable for a given trace.
- **Filter:** Phase 1 emits on **success only** (no failure record shape exists yet; errors today
  fall into chat.ts's catch with no emission — a failure-broadcast path is a follow-up). Property
  filters (send only if all `{key,value}` match) are supported.
- **Fan out:** `Promise.allSettled(dests.map(d => withTimeout(d.send(record, signal), timeoutMs)))`.
  Each `send` is independently try/caught with an `AbortController` timeout. A rejection only logs
  (per-dest delivery counter / `console.error`) — it never propagates.

**OTLP family vs proprietary** — one canonical record in, per-destination serializer out:

- **OTLP/JSON serializer (shared):** generic OTLP collectors + the OTLP mode of Langfuse, PostHog,
  W&B. Emits `gen_ai.*` GenAI-semantic-convention spans (proto3-JSON: int enums, int64 as decimal
  strings, 32-hex trace id / 16-hex span id, typed `AnyValue`). Span start/end from
  `startedAtMs`/`finishedAtMs` (→ nanoseconds); cost → vendor-namespaced `terminus.cost.usd`; finish
  reason → `gen_ai.response.finish_reasons` (array); session → `gen_ai.conversation.id`.
- **Proprietary adapters:** each transforms the canonical record into the vendor JSON (§8).

## 7. Runtime config & storage

**Storage: D1**, mirroring `provider_credentials` (`db/schema.ts`) — the transactional, already-used
pattern. KV is rejected (eventually-consistent; "configurable mid-runtime" wants read-after-write).

New table `broadcast_destinations` (owner-scoped, same `owner_type`/`owner_id` model as
credentials):

| column                              | type        | purpose                                                                                                                                                                                                           |
| ----------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                | text PK     |                                                                                                                                                                                                                   |
| `owner_type` / `owner_id`           | text        | `platform` (single-tenant) / BYOK                                                                                                                                                                                 |
| `type`                              | text        | adapter discriminator (`otlp`/`posthog`/`webhook`/`s3`/…)                                                                                                                                                         |
| `enabled`                           | bool        | toggle without delete                                                                                                                                                                                             |
| `config`                            | text (JSON) | **non-secret only**: endpoint/host/region, non-secret headers (e.g. `Content-Type`), `samplingRate` (0–1), `includeContent` (gated, §1), `propertyFilters`, `eventTypes`                                          |
| `secret_encrypted`                  | text        | **ALL auth material** — Bearer token / Basic `user:pass` / api key / HMAC key / S3 access+secret keys. AES-256-GCM via `encryptSecret`/`decryptSecret` (`@open-inspect/shared`), owner-as-AAD — same as the vault |
| `label`, `created_at`, `updated_at` |             | mirror credentials                                                                                                                                                                                                |

**Secrets never live in `config`.** Auth headers (`Authorization: Bearer …`, `x-api-key`,
`DD-API-KEY`, the PostHog body key, the HMAC signing key) are decrypted from `secret_encrypted` and
assembled at send time. The admin write path **rejects secret-looking header names**
(`authorization`, `x-api-key`, `*-key`, …) in plaintext `config`, mirroring the vault's rule that
public metadata never includes a secret (`vault.ts`, `admin.ts`).

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
a pure `record → wire` map + a `fetch`. **Phase tag** in the heading (§10).

### OTLP/JSON (generic) — _Phase 1_

`POST {endpoint}/v1/traces`, `Content-Type: application/json`. Per-backend auth menu (Bearer / Basic
via `btoa` / `x-honeycomb-team` / `api-key`) — all from `secret_encrypted`. `gen_ai.*` spans,
proto3-JSON encoding (int enums, int64-as-string, 32-hex traceId, typed AnyValue).
`gen_ai.provider.name`, `gen_ai.request.model` + `gen_ai.response.model`,
`gen_ai.usage.input_tokens`/`output_tokens`, `gen_ai.response.finish_reasons` (array),
`gen_ai.conversation.id` (session); **cost → `terminus.cost.usd`** (not standard); span start/end
from `startedAtMs`/`finishedAtMs`. 200 may carry `partial_success` — log, never fail.

### PostHog (capture API) — _Phase 1_

`POST {host}/i/v0/e/` (single) or `/batch/` (fan-out). **No auth header — project key (`phc_…`) goes
in the JSON body field `api_key`** (from `secret_encrypted`). Event `$ai_generation`. Props (inside
`properties`): **split** `$ai_model` (bare) + `$ai_provider`;
`$ai_input_tokens`/`$ai_output_tokens`; **`$ai_total_cost_usd`** (we set it → overrides PostHog
auto-calc); **`$ai_latency` in SECONDS (divide ms by 1000)**; **`$ai_stop_reason`** (NOT
`$ai_finish_reason`); `$ai_trace_id`; `$ai_session_id`. `host` runtime-configurable
(us/eu/self-host). LiteLLM `posthog.py` reference. _Gotcha: no `$ai_total_tokens`; omit it._
(`$ai_input`/`$ai_output_choices` only once content is ungated, §1.)

### Generic webhook — _Phase 1_

`POST {url}` JSON body = the metric subset of the canonical record. **HMAC-SHA256 signature** over
the body via `crypto.subtle` (key from `secret_encrypted`), sent as a signature header
(Helicone-style). **SSRF guard (non-optional):** HTTPS-only + reject localhost/0.0.0.0, private IPv4
(10/8, 172.16–31, 192.168/16), link-local 169.254/16, cloud-metadata IPs, and
`.local/.internal/.corp/.lan` suffixes.

### Object storage (S3 / S3-compatible, incl. R2) — _Phase 2_

The **runtime-configurable** path is **S3 SigV4 over `fetch`** (`crypto.subtle` HMAC-SHA256 +
SHA-256) — works for AWS S3, MinIO/GCS/B2/Wasabi, **and R2's S3 endpoint**; access-key-id + secret
in `secret_encrypted`; fully runtime-addable. One JSON object per trace
(`Content-Type: application/json`, optional `Content-Encoding: gzip` via `CompressionStream`),
date-partitioned key `traces/{tenant|_}/{YYYY}/{MM}/{DD}/{sessionId}/{traceId}.json`. LiteLLM
`s3_v2.py` (manual SigV4 over fetch) proves the no-SDK path; Helicone proves gzip + key hierarchy.
**R2 _native binding_** (`env.BUCKET.put`, no creds/signing) is a **deploy-time** fast-path for _our
own_ bucket only — a binding is declared in `Env`/`workers-terminus.tf` and needs a redeploy, so it
**cannot** satisfy "add a destination at runtime." Offered later as an optimization that references
a pre-bound bucket by name; it does not replace the SigV4 path.

### LangSmith — _Phase 2_

`POST /api/v1/runs/batch` body `{post:[run]}`. Auth `x-api-key` (NOT Bearer; `lsv2_pk_…`). Run with
`run_type:"llm"`; **`extra.metadata.ls_model_name` + `ls_provider` are REQUIRED** for model/cost id;
`trace_id == id` and `dotted_order = strftime("%Y%m%dT%H%M%S%fZ", start) + id` for a standalone run;
ISO-8601 timestamps (latency derived from start/end); `inputs.messages` / `outputs.choices[]`.
LiteLLM `langsmith.py` reference. _Our computed cost has no native field → stash in
`extra.metadata`._

### Langfuse — _Phase 2_

**Native batch (recommended):** `POST /api/public/ingestion` body
`{batch:[trace-create, generation-create]}`. Basic auth `btoa(pk:sk)` (`pk-lf-…:sk-lf-…`). Split
**`usageDetails`** (`{input,output,total}` ints) + **`costDetails`**. We carry only a **total**
gateway cost, so send **`costDetails: { total: costUsd }`** (per-direction `input`/`output` cost is
a deferred enhancement — adding it would require splitting cost in the canonical record, §13.6; we
do _not_ re-price per destination). String ids (no OTLP hex/nanosecond ceremony). Generation `id`
must differ from trace `id`. Region base URL must match the keys. (OTLP mode also via the shared
serializer → `/api/public/otel/v1/traces`.) LiteLLM `langfuse.py` reference.

### Datadog LLM Observability — _Phase 2_

`POST https://api.{DD_SITE}/api/intake/llm-obs/v1/trace/spans`. Header **`DD-API-KEY`** (raw key,
colon, not Bearer). Proprietary span JSON
`{data:{type:"span",attributes:{ml_app, tags, spans:[…]}}}`. **`start_ns`/`duration` in
NANOSECONDS** (`startedAtMs * 1e6`, `latencyMs * 1e6`). **`model_name` nested at
`meta.metadata.model_name`** (not `meta.model_name`). `metrics` floats (`input_tokens`,
`total_cost`…). `ml_app` REQUIRED. Success = **HTTP 202, empty body**. Keep each POST under 1 MB
(spans over ~1 MB are silently dropped). LiteLLM `datadog_llm_obs.py` reference.

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
- **Best-effort everywhere:** `dispatch()` is void; the fan-out runs in `ctx.waitUntil` with
  `Promise.allSettled`, per-`send` try/catch + `AbortController` timeout. A destination error logs;
  it never adds latency and never fails the LLM call. (Matches the
  `LoggingUsageSink`/`NoopTraceSink` "must never throw" contract.)
- **Credentials** encrypted at rest (reuse `encryptSecret`/`decryptSecret`), decrypted only in
  isolate at send time. SSRF guard on every URL/webhook destination is non-optional.

## 10. Phasing — **the decision for Nejc**

8 destinations + framework + D1 + admin + SSRF + HMAC + sampling + test-connection + terraform is
more than one reviewable PR. Proposed cut (one PR = Phase 1; the rest fast-follow):

- **Phase 1 (this PR): the seam end-to-end, metrics-only, + a reference set that exercises every
  concern once.** Completion helper + `chat.ts` changes (span timing / traceId / finish /
  dispatch) + dispatcher (void, `allSettled`/`waitUntil`/sampling/filtering) + D1
  `broadcast_destinations` + `DestinationStore` + admin CRUD + test-connection + SSRF + HMAC.
  **Reference adapters: generic OTLP/JSON, PostHog capture, generic webhook** — proves _both_
  protocol families and every cross-cutting concern (SSRF, HMAC, sampling, encryption,
  test-connection, config CRUD). The content tier is plumbed but gated OFF (§1).
- **Phase 2 (fast-follow): object storage (S3 SigV4) + the clean proprietary adapters** — S3,
  LangSmith, Langfuse, Datadog. Against the now-frozen `BroadcastDestination` interface → ideal
  **Workflow fan-out** (one agent per adapter, TDD).
- **Deferred (own issues): ClickHouse** (needs Queue/DO batching) and **W&B Weave** (needs a
  protobuf path). Both flagged with the precise blocker above.

Why drop R2/object-storage from Phase 1: the R2 _native binding_ is deploy-time, not runtime (§8),
so it can't represent the "added at runtime" requirement; the honest runtime path is S3 SigV4, which
is heavier (hand-rolled signing) and better landed with the other Phase-2 adapters.
`{OTLP, PostHog, webhook}` already proves both families and every concern.

## 11. Testing (TDD)

- **Unit, per adapter:** canonical record → exact wire shape. Assert the error-prone details the
  research flagged (PostHog latency-in-seconds + `$ai_stop_reason` + model split; OTLP int64-as-
  string + 32-hex traceId; Datadog ns + nested `model_name` + 202; Langfuse `costDetails`;
  SigV4/HMAC signatures via known vectors).
- **Unit, dispatcher:** `dispatch()` is void (returns before sends run); `allSettled` isolation (one
  throwing dest doesn't affect others); deterministic sampling (same `(dest, trace)` → stable; two
  dests at the same rate select _different_ sets); success-only filtering; default-empty = no-op.
- **Unit, record:** `toEmissionRecord` composition (no re-derivation); content gated OFF;
  provider-from-model split; span-timing/latency with injected `now`/clock.
- **Integration (real D1, Miniflare):** `DestinationStore` CRUD + admin routes + secret-in-config
  rejection + `afterEach` table cleanup, mirroring `admin.test.ts`. Fake destinations via
  `createApp({ broadcast })`.
- Fakes use the injectable `now`/`newTraceId` (span timing + traceId become deterministic).

## 12. Deployment & safety

- **Default-empty = safe to ship.** Zero configured destinations → the dispatcher is a no-op;
  merging Phase 1 changes nothing operationally until an operator adds a destination via the admin
  API.
- D1 migration auto-applies (terraform sha-trigger). Phase-1 destinations (OTLP/PostHog/webhook)
  need **no new binding** — creds live in the encrypted column. Phase-2 S3 uses SigV4 (still no
  binding); the optional R2 _native_ fast-path is the only one that needs a deploy-time binding.
- **Phase 1 is metrics-only.** Content capture stays default-OFF (`TERMINUS_TRACE_CAPTURE_ENABLED`)
  and is not broadcast at all until CON-43 (§1).

## 13. Open decisions (for Nejc's review)

1. **Phase-1 cut (lead question).** OK to land Phase 1 = seam (metrics-only) + {OTLP, PostHog,
   webhook}, with object-storage(S3 SigV4) + LangSmith/Langfuse/Datadog as a fast-follow Workflow
   and ClickHouse/W&B deferred to their own issues? Or a different reference set?
2. **W&B protobuf.** Accept deferral, or build a minimal OTLP-protobuf writer now?
3. **ClickHouse batching.** Accept deferral to a Queue/DO consumer, or is a per-call `async_insert`
   adapter (accepting the "too many parts" risk) acceptable as an interim?
4. **Latency semantics.** Confirm: non-streaming `latencyMs` = true upstream duration; **streaming
   `latencyMs` = client-pull-observed** (true upstream-finish needs buffering, which defeats CON-74
   — rejected), with **`ttftMs` captured at the first-chunk peek** as the streaming signal. OK?
5. **Content tier (metrics-only Phase 1).** Confirm content is NOT broadcast until CON-43
   (sanitizer + per-session consent) — even when `TERMINUS_TRACE_CAPTURE_ENABLED` is on — and the
   seam only plumbs the (gated-off) content field now. OK?
6. **Langfuse cost.** Forward total only (`costDetails.total`) and defer per-direction input/output
   cost, or add an input/output cost split to the canonical record now?
