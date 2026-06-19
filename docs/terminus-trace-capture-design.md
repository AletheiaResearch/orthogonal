# Terminus trace content-capture — design spec (CON-61)

**Status:** scope locked (2026-06-18, Nejc) · **Branch:** `nejc/con-61-trace-capture` (off
`terminus`) · **Issue:** CON-61 (parent CON-43 trace-store program) · **Spec is source of truth.**

> **Minimal seam only.** CON-61 builds the gateway-side _capture seam_ — a `TraceRecord`, a
> `TraceSink` interface + no-op default, a capture tap in the chat route, and a default-OFF env
> flag. It does **not** build any consumer. Sanitization, the trace store (ClickHouse), consent UI,
> and event-stream capture are **out of scope** and land with CON-43 / CON-40 / CON-73.

> Interacts with → **CON-74** (streaming-request fallback): CON-74 rewrites the streaming _block_ in
> `chat.ts` but still routes every stream part through `toOpenAIChatStream`. The streaming capture
> seam therefore lives **inside that mapper**. CON-74 landed first and this branch was rebased onto
> it — see §9 for the resolved merge (chunk-1 re-yield verified).

## 1. Goal

Give the gateway a single, best-effort boundary at which a _successful_ chat completion's raw
content — the request messages and the response (assistant text + tool calls) — can be handed to an
injectable sink alongside the usage/cost record the gateway already computes. Nothing consumes it
yet: the default sink is a no-op and the flag is off, so the default build captures, stores, and
logs **nothing**. The seam exists so CON-43 (sanitize → store) and CON-73 (sanitize → broadcast) can
plug a real consumer in later **without touching the call sites**, exactly as `UsageSink` (CON-54)
defers its durable timeseries sink.

This mirrors the existing usage seam: `UsageRecord` + `UsageSink` + a default sink, injected through
`ChatDeps`, emitted at the completion boundary via `c.executionCtx.waitUntil` (best-effort, never
throws, off the hot path).

## 2. Current state (verified against the code)

- `services/terminus/src/usage/sink.ts` — `UsageRecord` (sid, tenant, model, token counts,
  `costUsd`, `createdAt`) + `UsageSink { record(usage): Promise<void> }` + `LoggingUsageSink` (logs
  a structured line; "never throw — usage is best-effort").
- `services/terminus/src/routes/chat.ts` — `chatCompletions(c, deps)`:
  - `ChatDeps` carries `usageSink`, `credentials`, `policy?`, and test injectables (`buildModel`,
    `now`, `newId`).
  - `usageRecord(claims, model, usage, createdAt, cost)` builds the `UsageRecord`.
  - `emit(usage)` records it best-effort via `c.executionCtx.waitUntil`, swallowing+logging sink
    rejections so a sink failure never fails a good completion.
  - **Non-streaming** (`generateText`): on success, `result.text` / `result.toolCalls` /
    `result.finishReason` / `result.totalUsage` are in hand where the `chat.completion` body is
    built.
  - **Streaming** (`streamText`): `toOpenAIChatStream(result.fullStream, meta, onUsage, onError)`
    maps every part to OpenAI SSE frames; `onUsage` fires once on the `finish` part.
- `services/terminus/src/openai/protocol.ts` — `toOpenAIChatStream` (the streaming mapper) and the
  `CompletionParts { content, toolCalls, finishReason, usage }` type used to build the non-streaming
  body. Tool calls are shaped `{ toolCallId, toolName, input }` in both paths. The mapper handles
  `text-delta`, `tool-call`, `finish`, `error` and **ignores reasoning deltas**.
- `services/terminus/src/index.ts` — `createApp(deps)`: sinks are constructed **once**
  (`usageSink = deps.usageSink ?? new LoggingUsageSink()`); per-request, env-derived deps are wired
  in the handler closure (`credentials: buildCredentials(c.env)`, `policy: policyStoreFor(c.env)`).
- `services/terminus/src/env.ts` — `Env` interface; flags are plain optional string fields.
- Tests: `app.test.ts` drives `createApp({ ...deps })` and `.request(path, init, env)` (env is the
  third arg → flags are flippable per test); `protocol.test.ts` unit-tests the mapper directly.

## 3. Scope

**In:** `TraceRecord`, `TraceSink`, `NoopTraceSink`; `TERMINUS_TRACE_CAPTURE_ENABLED` env flag
(default off); capture tap in `chat.ts` for both response paths; the `onComplete` seam in
`toOpenAIChatStream`.

**Out (explicitly deferred, not built here):** PII sanitization (CON-43), the ClickHouse trace store
(CON-43), per-session consent gating (CON-43 — _not_ this env flag), consent UI, event-stream
capture (CON-40), and the broadcast consumer (CON-73). No DB schema, no migrations.

## 4. `TraceRecord` + `TraceSink` — new file `src/trace/sink.ts`

A dedicated `trace/` directory (CON-43's sanitizer + store will land here); imports `UsageRecord`
from `../usage/sink`, `OpenAIChatMessage` from `../openai/protocol`, and the raw `FinishReason` from
`ai`.

```ts
export interface TraceToolCall {
  id: string;
  name: string;
  /** Raw tool-call input as the model produced it (object/array/scalar). Unsanitized. */
  input: unknown;
}

export interface TraceRecord {
  /** Usage/cost/identity/timing — sid, tenant, model, tokens, costUsd, createdAt. */
  usage: UsageRecord;
  /** Raw request messages, exactly as the client sent them. Unsanitized PII. */
  requestMessages: OpenAIChatMessage[];
  /** Concatenated assistant text. Unsanitized PII. */
  responseText: string;
  /** Assistant tool calls. Unsanitized PII. */
  responseToolCalls: TraceToolCall[];
  /**
   * Raw AI SDK finish reason, preserved verbatim — NOT coerced to the OpenAI wire enum.
   * Capture fires on the `finish` part, which can carry a non-success reason
   * (`"error"`/`"other"`/`"unknown"`/absent); storing it raw lets a downstream consumer
   * (CON-43) tell those from a clean `"stop"`. The seam neither gates nor coerces; the
   * client SSE/JSON still maps the reason to the OpenAI enum independently.
   */
  finishReason: FinishReason | undefined;
}

export interface TraceSink {
  record(trace: TraceRecord): Promise<void>;
}

/**
 * Default sink: captures NOTHING. Unlike LoggingUsageSink it MUST NOT log the
 * record — TraceRecord carries raw, unsanitized request/response content (PII).
 */
export class NoopTraceSink implements TraceSink {
  record(_trace: TraceRecord): Promise<void> {
    return Promise.resolve();
  }
}
```

The file header comment states **loudly**:

> The content in a `TraceRecord` is **raw and unsanitized**. Any real consumer (CON-73 broadcast,
> CON-43 store) MUST run CON-43's sanitizer **before** persisting or transmitting it. Per-session
> **consent** — distinct from the coarse `TERMINUS_TRACE_CAPTURE_ENABLED` env flag, which is an
> operator kill-switch, not user consent — also lands with CON-43. Capturing raw content here is
> acceptable **only** because the default sink (`NoopTraceSink`) discards it and the flag is off by
> default.

**Why embed `usage: UsageRecord`** (vs flattening its fields): it already carries the brief's full
"usage/cost/model/timing/sid/tenant" set; the chat route already builds it; nesting reuses that
single source of truth with zero recomputation and no field-drift risk. (Decided 2026-06-18, Nejc.)

## 5. The flag — gated at the handler edge

`Env` gains:

```ts
/** Default-OFF kill-switch for raw trace content-capture (CON-61). Truthy = on. */
TERMINUS_TRACE_CAPTURE_ENABLED?: string;
```

Gating happens in `index.ts`, mirroring the `buildCredentials(c.env)` / `policyStoreFor(c.env)`
idiom — **not** inside `chat.ts`:

- `NoopTraceSink` is constructed once: `traceSink = deps.traceSink ?? new NoopTraceSink()`.
- `AppDeps` gains `traceSink?: TraceSink` (test injection point).
- The chat handler passes `traceSink` into `ChatDeps` **only when the flag is truthy**, else omits
  it:

  ```ts
  chatCompletions(c, {
    ...,
    traceSink: traceCaptureEnabled(c.env) ? traceSink : undefined,
  })
  ```

- `ChatDeps` gains `traceSink?: TraceSink`. `chat.ts` gates **purely on `deps.traceSink` presence**.

Truthiness: `traceCaptureEnabled(env)` returns true for `"true"` / `"1"` (case-insensitive), false
otherwise (including unset). Consequences:

- **Off (default):** `deps.traceSink` is undefined → no `onComplete` passed to the mapper, no
  accumulation, no `captureTrace` call. **Zero content handling, zero overhead.**
- **On, no real sink wired (prod today):** `NoopTraceSink` runs and discards. Nothing stored/logged.
- Keeps `chat.ts` free of env-parsing and unit tests free of `c.env` mocking (just pass/omit a spy
  `traceSink` as a dep).

## 6. Capture tap in `chat.ts`

A `captureTrace(parts: CompletionParts)` helper, sibling to `emit`, active only when
`deps.traceSink` is set. It is **best-effort and isolated**: the try/catch wraps **both** the
synchronous `TraceRecord` build and the `waitUntil` dispatch, because in the streaming path it fires
_inside_ the generator during a stream pull — a throw while building the record must never corrupt
the live response stream (mirrors `emit`, hardened for the in-stream call site).

```ts
const captureTrace = (parts: CompletionParts): void => {
  if (!deps.traceSink) return;
  try {
    const trace: TraceRecord = {
      usage: usageRecord(claims, body.model, parts.usage, nowMs, ref.model.cost),
      requestMessages: body.messages,
      responseText: parts.content,
      responseToolCalls: parts.toolCalls.map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        input: tc.input,
      })),
      // Raw, NOT coerced: the client wire format maps it, the trace preserves it.
      finishReason: parts.finishReason,
    };
    const p = deps.traceSink.record(trace).catch((e) => {
      console.error(JSON.stringify({ event: "terminus.trace.sink_error", message: errMsg(e) }));
    });
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      // no ExecutionContext (unit tests); the record still runs to completion
    }
  } catch (e) {
    console.error(JSON.stringify({ event: "terminus.trace.capture_error", message: errMsg(e) }));
  }
};
```

- **Non-streaming:** after the existing `await emit(result.totalUsage)`, call `captureTrace` with
  the same `CompletionParts` already passed to `toOpenAIChatCompletion` (`content: result.text`,
  `toolCalls: result.toolCalls`, `finishReason: result.finishReason`, `usage: result.totalUsage`).
- **Streaming:** pass `onComplete` to `toOpenAIChatStream` **only when** `deps.traceSink` is set;
  the callback is `captureTrace` (see §7).

`requestMessages` stores the raw `body.messages` (the OpenAI request as sent), not the
`toModelMessages`-converted form — the trace should reflect the client's actual input.

## 7. Streaming seam — `onComplete` in `toOpenAIChatStream`

Add one optional param to the mapper:

```ts
export async function* toOpenAIChatStream(
  fullStream, meta, onUsage?, onError?,
  onComplete?: (parts: CompletionParts) => void,
): AsyncGenerator<string> { ... }
```

- When `onComplete` is **absent**, the mapper does no accumulation (zero overhead — the off path).
- When present, it accumulates `content` (concatenated `text-delta` text) and `toolCalls` (each
  `tool-call` part as `{ toolCallId, toolName, input }`) as parts stream by, and on the `finish`
  part calls
  `onComplete({ content, toolCalls, finishReason: part.finishReason, usage: part.totalUsage })`.
- Reuses the existing `CompletionParts` type → no trace-type import into `protocol.ts`; `chat.ts`
  maps `CompletionParts` → `TraceRecord`.
- Reasoning deltas are **not** accumulated (the mapper already ignores them) — text + tool-calls
  only.

## 8. Capture semantics (precise)

- **Fires only on `finish`.** A stream that hits the `error` part returns early → `onComplete` never
  fires → **no trace** for errored/partial streams. Non-streaming failures (retryable fallback,
  thrown `GatewayError`) never reach `captureTrace` → **no trace**. Captured ⇒ the generation
  reached a `finish` (the client got a committed response).
- **Finish reason is raw, not gated/coerced.** A `finish` can still carry a non-success reason
  (`"error"`/`"other"`/`"unknown"`/absent); the seam captures it and stores `parts.finishReason`
  **verbatim** (the client wire format maps it to the OpenAI enum independently). The seam does not
  decide what counts as "success" — it preserves the signal so CON-43's consumer can filter. (Per
  Codex review — coercing here would record a failed completion as a clean `"stop"`, uncorrectable
  downstream.)
- **Content scope:** request messages (raw) + assistant text + assistant tool calls. **No**
  reasoning content, **no** system-injected guardrail mutations beyond what's in `body.messages`.
- **Never affects the response:** capture is fire-and-forget via `waitUntil`; build + dispatch are
  isolated; a throwing/rejecting sink logs and is swallowed.

## 9. CON-74 merge (landed — resolved)

CON-74 (streaming-request fallback) **landed on `terminus` first**, so this branch was rebased onto
it. As predicted, the streaming call-site in `chat.ts` conflicted (both edit that block); the
accumulation **inside the mapper** did not. Resolution: `onComplete` re-added to the
`toOpenAIChatStream(peeked.stream, …)` call inside CON-74's per-candidate peek loop.

**Chunk-1 re-yield — verified.** CON-74's `peekStream` commits on the first client-output part and
returns `drain(first, it)`, which **re-yields that peeked part** before draining the rest (see
`routes/stream-fallback.ts`). `partStartsClientOutput` matches exactly the `text-delta` /
`tool-call` / `finish` parts the mapper accumulates, so the committed stream the mapper consumes
includes chunk 1 — **no content is dropped from accumulation.** Leading non-output parts (`start`,
`reasoning`) that the peek discards are parts the mapper already ignores.

**Streaming error semantics changed (test updated).** Under CON-74 a stream that errors **before**
any output no longer commits a 200 SSE — the peek rotates to the next candidate / returns a clean
HTTP error. The "no trace on error" test therefore now exercises the **committed-then-errors** path
(emit a `text-delta` to commit, then error before `finish`): the stream commits 200, surfaces the
error mid-stream, never reaches `finish`, so `onComplete` never fires and no trace is captured.

## 10. Testing (TDD — test first, watch it fail)

**Mapper unit tests (`openai/protocol.test.ts`):**

- `onComplete` fires once on `finish` with accumulated `content` + `toolCalls` (multi-delta + a
  tool-call part) and the finish `usage`/`finishReason`.
- `onComplete` **never** fires when the stream errors before finish.
- Absent `onComplete` → unchanged frame output (no regression).

**App tests (`app.test.ts`)** via `createApp({ traceSink: spy, ... })` + `.request(..., env)`:

- Flag **off** (default env), spy sink injected → `record` **never** called, for both streaming and
  non-streaming.
- Flag **on** → exactly one `TraceRecord` with correct `requestMessages`, `responseText`,
  `responseToolCalls`, embedded `usage`, `finishReason` — for both paths.
- Flag **on**, **throwing** sink → completion still returns 200 with the normal body/stream.
- Flag on, streaming **error** before finish → no `record` call (ties §8 to the integration level).

## 11. Verify gate

`pnpm --filter @open-inspect/shared build` (only if shared is touched — not expected) →
`pnpm --filter @orthogonal/terminus typecheck && test && run test:integration` → `pnpm fmt:check` →
`pnpm lint` (warnings ok, exit 0).

## 12. Files touched

- `services/terminus/src/trace/sink.ts` — **new** (`TraceRecord`, `TraceToolCall`, `TraceSink`,
  `NoopTraceSink`).
- `services/terminus/src/trace/sink.test.ts` — **new** (if any sink-level unit coverage warranted;
  the no-op is trivial — primary coverage is in protocol/app tests).
- `services/terminus/src/env.ts` — add `TERMINUS_TRACE_CAPTURE_ENABLED?`.
- `services/terminus/src/openai/protocol.ts` — add `onComplete` param + accumulation.
- `services/terminus/src/openai/protocol.test.ts` — mapper tests.
- `services/terminus/src/routes/chat.ts` — `ChatDeps.traceSink?`, `captureTrace`, wire both paths.
- `services/terminus/src/index.ts` — `AppDeps.traceSink?`, construct `NoopTraceSink`,
  `traceCaptureEnabled(c.env)` gating in the chat handler.
- `services/terminus/src/app.test.ts` — capture integration tests.
- `docs/terminus-llm-gateway.md` — one-line pointer to this spec (no duplication).
