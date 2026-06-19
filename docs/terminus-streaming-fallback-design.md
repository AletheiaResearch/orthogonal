# Terminus — streaming-request fallback (CON-74) — design spec

**Status:** design approved (one decision locked below) · **Branch:**
`nejc/con-74-streaming-fallback` (off `terminus`) · **Issue:** CON-74 (deferred from CON-71) ·
**Date:** 2026-06-18

## 1. Problem

CON-71's cross-candidate fallback (try the next credential/provider on a retryable upstream error)
covers **non-streaming** requests only. The streaming path can't fall back today:

`streamText()` (`routes/chat.ts`) returns **synchronously** without connecting to the upstream. The
SSE `Response` is constructed and returned immediately; `result.fullStream` is consumed later,
inside the `ReadableStream.pull()` — **after** the `Response` has committed. So (a) the route's
`try/catch` never sees a streaming upstream error, and (b) once the first SSE byte is flushed,
switching credentials would be a client-visible break. Result: a streaming request whose (only)
candidate fails just errors, even when a healthy sibling credential exists.

## 2. Goal

Give streaming requests the **same** cross-candidate fallback the non-streaming path has, **without
ever breaking a stream the client has already started receiving**. Share the retry classification
with the non-streaming loop. Non-streaming behavior is unchanged.

## 3. Approach — peek-first-chunk, streaming as a candidate loop

Turn the streaming branch into the same candidate loop as non-streaming. For each candidate,
**peek** the stream before committing the `Response`:

```
for candidate in candidates:
  cred = resolve(); if !cred: continue
  model = buildModel(cred)
  result = streamText({ ...callOptionsFor(model), maxRetries: 0 })  # disable SDK same-target retry;
                                                    #   the gateway now owns streaming fallback too
  peeked = await peekStream(result.fullStream)      # drives the upstream until the decision point
  if peeked.kind == "error":                        # error before any client byte
    if !isRetryableUpstreamError(peeked.error): throw peeked.error   # pre-commit → clean HTTP error
    lastError = peeked.error
    recordFailure(candidate, cooldownUntilFromError(...))            # cool down, try next candidate
    continue
  # peeked.kind == "commit": a client-output part is in hand
  return SSE Response over toOpenAIChatStream(peeked.stream, …)      # no further fallback
throw lastError ?? Error("all upstream streaming candidates failed")  # all retryable-failed → clean HTTP error
```

### 3.1 `peekStream(fullStream)` (new, pure, unit-testable)

Drives the stream's async iterator until the **first part that produces client output** or the first
**error**, then returns a discriminated result:

```
async function peekStream(fullStream):
  it = fullStream[Symbol.asyncIterator]()
  loop:
    try: res = await it.next()
    catch (error): return { kind: "error", error }          # connect/auth/abort error
    if res.done: return { kind: "commit", stream: rest(it) } # ended with no client output → empty stream
    part = res.value
    if part.type == "error": return { kind: "error", error: part.error }
    if partStartsClientOutput(part): return { kind: "commit", stream: prepend(part, it) }
    # else: a non-output part (start / reasoning / text-start / tool-input-delta / …) — discard, keep peeking
```

- **`partStartsClientOutput(part)`** — the parts `toOpenAIChatStream` turns into SSE frames:
  `text-delta`, `tool-call`, `finish`. This predicate is **the same source of truth** as the
  mapper's emit set (exported from `openai/protocol.ts`, covered by a test that asserts
  consistency), so the peek can never discard a part the mapper would have emitted (no data loss)
  nor commit on a part that produces no client byte (no needless loss of fallback).
- Parts the mapper already ignores (`start`, `reasoning*`, `text-start`, tool-input deltas, …) are
  **discarded** during peek — behavior-preserving, since the committed stream would have ignored
  them anyway. Discarding (not buffering) keeps peek memory O(1) even through a long pre-text
  reasoning phase.
- **`prepend(first, it)`** / **`rest(it)`** — async generators that re-yield the peeked part (if
  any) then drain the rest of the iterator, so the committed stream is **lossless** and
  `toOpenAIChatStream` consumes it unchanged.
- **Cancellation propagation (required, not mock-testable).** The helpers drive a _manually
  obtained_ iterator, so they MUST `try { … } finally { await it.return?.() }`. Otherwise, when the
  client disconnects and `asReadable.cancel()` → the generator's `.return()` fires, the underlying
  fetch-backed upstream is **abandoned, not cancelled** (a connection leak that mocks never
  surface). Likewise, `peekStream` calls `await it.return?.()` on its own error/non-commit exits
  before falling back to the next candidate, so a failed candidate's upstream is released. Covered
  by an explicit "client cancels mid-stream → upstream `iterator.return()` is called" test using a
  fake iterator that records `return()`.

### 3.2 What "commit" means

Committing = the first client-output part is in hand, so the next thing the client sees is real
output. From there: build the SSE `Response` over `toOpenAIChatStream(peeked.stream, …)` exactly as
today. **Fallback is off** — any later upstream error arrives as a `part.type === "error"` in the
remaining stream and is surfaced **mid-stream** as an SSE error frame (today's behavior), never
retried.

## 4. Error handling (decision locked)

- **Pre-commit, retryable** (first part is a retryable `error`, or the iterator throws a retryable
  connect error): cool the candidate down and try the next. Mirrors the non-streaming loop.
- **Pre-commit, non-retryable** (e.g. 400/401, client abort): **`throw`** → the route's outer
  `catch` returns `errorResponse(toGatewayError(err))` — a **clean HTTP error status**, since no SSE
  byte was sent. _(Decision: clean status over today's `200` + SSE-error-frame. Strictly better for
  clients/alerting; only **post**-commit errors surface as SSE frames.)_
- **All candidates exhausted** (every live candidate failed retryably during peek):
  `throw lastError` → clean HTTP error, same as the non-streaming loop. (The "all cooled down → 503
  vs unconfigured → 502" split already happens before the loop via the existing
  `candidates.length === 0` check.)
- **Post-commit**: unchanged — mid-stream SSE error frame; no double-billing, no duplicated partial
  output (we never restart a committed stream).

**Latency tradeoff (accepted):** peeking awaits the upstream's first token before the SSE `Response`
commits, so response headers flush slightly later than today's immediate return. The client waits
for the first token either way; the gain is fallback + clean pre-first-token error statuses. Also
disable the SDK's same-target `maxRetries` for streaming (set `maxRetries: 0`, matching
non-streaming) so the gateway's fallback isn't preceded by hidden SDK backoff.

## 5. Health + usage (unchanged semantics)

- **Commit + successful `finish`** → `recordSuccess(candidate.id)` + emit usage (via
  `toOpenAIChatStream`'s `onUsage`), as today.
- **Pre-commit retryable failure** → `recordFailure(candidate.id, cooldown)` before trying the next
  candidate (now actually rotates this request, not just the next one).
- **Post-commit retryable error part** → `recordFailure` for the _next_ request (via `onError`), as
  today.
- All health/usage writes stay best-effort, off the hot path via `c.executionCtx.waitUntil`.

## 6. Invariants (must hold)

- **No restart after a client byte:** once committed, never switch candidates — no double-billing,
  no duplicated/partial output.
- **Lossless commit:** the peeked part(s) are re-emitted; the served content equals what the chosen
  candidate produced.
- **Shared classification:** streaming and non-streaming use the same `isRetryableUpstreamError` /
  `cooldownUntilFromError` (429/5xx/network retryable; 400/401/abort/`GatewayError` terminal).
- **No model substitution:** every candidate resolves the **same** requested model (CON-71
  invariant); fallback swaps only the credential.
- **Peek memory is O(1):** non-output parts are discarded, not buffered.
- **Cancellation propagates:** client disconnect / fallback releases the upstream iterator
  (`it.return?.()`); no abandoned upstream connections.

## 6b. Verified / decided (advisor review)

- **SDK error surfacing (`ai@6.0.199`, verified against the installed `.d.ts`).**
  `fullStream: AsyncIterableStream<TextStreamPart>`; the union carries an explicit
  `{ type: "error"; error }`. The codebase already assumes errors arrive as `error` **parts** (the
  mapper's `part.type === "error"`), and the peek **additionally** wraps `it.next()` in try/catch —
  so the decision point is robust to _both_ a thrown error and an `error` part, and an `error` part
  arriving _after_ a content part is correctly handled by post-commit (mid-stream SSE, no retry).
  `abort`, `tool-result`, `file`, `source` parts are non-output (mapper already ignores them) →
  discarded in peek.
- **Discard vs buffer-all (decided: discard).** Buffering every leading part until first output
  would make commit data-integrity independent of the predicate — but the mapper **ignores
  reasoning**, and Claude/Codex reasoning models emit a long `reasoning-delta` run _before_ the
  first `text-delta`. Buffer-all would hold all that reasoning in memory only to have the mapper
  discard it. Discard keeps peek O(1) on the primary path; the predicate-drift risk is contained by
  colocating `partStartsClientOutput` with the mapper + a drift-guard test.
- **Hung-upstream failure mode (flagged).** Peek delays header flush until the first token, so a
  _silent-hang_ upstream yields no response at all (vs today's immediately-committed empty SSE).
  `abortSignal: c.req.raw.signal` covers client give-up; the Worker/`EXECUTION_TIMEOUT` bounds the
  rest. If a first-token watchdog is wanted (fail a stalled upstream fast and fall back), it is a
  small follow-up, not in this issue.

## 7. Components touched

- `openai/protocol.ts` — export `partStartsClientOutput(part)` (the mapper's emit predicate);
  `toOpenAIChatStream` unchanged in behavior (optionally references the predicate in a
  comment/test).
- `routes/chat.ts` — replace the single-candidate streaming branch with the candidate loop + peek;
  reuse `callOptionsFor`, `emit`, `background`, and the classification already in scope.
- `routes/stream-fallback.ts` _(new, pure)_ — `peekStream` + `prepend`/`rest` helpers, so the
  streaming logic is unit-testable without a Worker/network (driven by `MockLanguageModelV3`).
- Tests — `routes/*.test.ts` for the new helper + the streaming-loop integration via the existing
  `MockLanguageModelV3` harness.

## 8. Test plan (TDD — acceptance criteria)

- **`peekStream`:** error-first part → `{kind:"error"}`; iterator throws → `{kind:"error"}`; leading
  non-output parts (reasoning/start) then `text-delta` → `{kind:"commit"}` and the committed stream
  **re-emits** the text-delta + the rest (lossless); `tool-call`-first and `finish`-first → commit;
  empty/`done` stream → commit (empty).
- **cancellation:** consuming a committed stream then `.return()`-ing it (client disconnect) invokes
  the underlying iterator's `return()` exactly once; a pre-commit error/fallback also `return()`s
  the failed candidate's iterator. (Fake iterator records `return()` calls.)
- **`partStartsClientOutput`:** true for `text-delta`/`tool-call`/`finish`, false for
  `start`/`reasoning*`/`error`/… — and a test asserting it matches the parts `toOpenAIChatStream`
  actually emits (drift guard).
- **chat streaming loop (injected fake `CredentialProvider` + `MockLanguageModelV3`):**
  - first candidate emits an **error-first** (retryable) part → transparently falls back to the
    second candidate; client sees the second candidate's tokens; failure recorded on #1, success on
    #2.
  - first candidate fails **after** the first token → NOT retried; error surfaces mid-stream; no
    second `streamText`.
  - pre-commit **non-retryable** (400) → clean HTTP error status, no SSE bytes.
  - **all** candidates error-first retryably → clean HTTP error (`throw lastError`).
  - happy path (first candidate streams fine) → unchanged SSE output + usage emit + `recordSuccess`.
- **Non-streaming** path tests unchanged + still green.

**Gate before done:** `pnpm --filter @open-inspect/shared build` →
`pnpm --filter @orthogonal/terminus typecheck && test && test:integration` → `pnpm fmt:check` →
`pnpm lint`. Advisor before declaring done.

## 9. Out of scope / deferred

- Streaming **reasoning** forwarding to the client (the mapper still ignores reasoning parts) — not
  this issue.
- Speculative/parallel candidate racing — single-candidate-at-a-time peek only.
