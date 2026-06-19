/**
 * Canonical broadcast record (CON-73) — the one record built per completed LLM call
 * and fanned out, unchanged, to every configured destination.
 *
 * Two tiers:
 *  - `metrics` — ALWAYS present, carries NO PII (model, derived provider, tokens,
 *    gateway-computed cost, span timing, trace/session ids, finish reason).
 *  - `content` — OPTIONAL, carries raw request/response (PII). Default-OFF and, in
 *    Phase 1, never attached: exporting raw content to an external destination must
 *    wait for CON-43's sanitizer + per-session consent (see `trace/sink.ts`). The
 *    field exists so the content tier need not be re-plumbed when CON-43 lands.
 *
 * `toEmissionRecord` **composes** the already-built `UsageRecord` (it does not
 * re-derive anything from the model response), preserving the "build once, fan out"
 * invariant — the same object is handed to all N destinations.
 */
import type { FinishReason } from "ai";

import type { OpenAIChatMessage } from "../openai/protocol";
import type { TraceToolCall } from "../trace/sink";
import type { UsageRecord } from "../usage/sink";

export interface EmissionMetrics {
  /** 16-byte trace id, lowercase hex (32 chars) — OTLP-native. See `trace-id.ts`. */
  traceId: string;
  /** Session id (gateway-token claim) — the attribution key. */
  sessionId: string;
  /** Tenant id (null during single-tenant rollout). */
  tenant: string | null;
  /** Provider-qualified model id (e.g. "anthropic/claude-opus-4-5"). */
  model: string;
  /** Provider id, derived from `model` (the first path segment). */
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Gateway-computed cost in USD (only the gateway holds pricing at request time). */
  costUsd: number;
  /** Upstream-attempt start (epoch ms) — the OTLP span start. */
  startedAtMs: number;
  /** Upstream-attempt finish (epoch ms) — the OTLP span end. Streaming caveat: §5. */
  finishedAtMs: number;
  /** `finishedAtMs − startedAtMs`. Non-streaming = true upstream; streaming = client-pull-observed. */
  latencyMs: number;
  /** Time-to-first-token (ms), measured at the first-chunk peek — streaming only. */
  ttftMs?: number;
  /** Raw AI-SDK finish reason, preserved verbatim (not coerced). */
  finishReason: FinishReason | undefined;
}

export interface EmissionContent {
  /** Raw request messages, exactly as the client sent them. Unsanitized PII. */
  requestMessages: OpenAIChatMessage[];
  /** Concatenated assistant text. Unsanitized PII. */
  responseText: string;
  /** Assistant tool calls. Unsanitized PII. */
  responseToolCalls: TraceToolCall[];
}

export interface EmissionRecord {
  metrics: EmissionMetrics;
  /** Gated OFF until CON-43; no Phase-1 destination receives content. */
  content?: EmissionContent;
}

/** The per-request fields the chat handler measures around the upstream call. */
export interface EmissionTiming {
  traceId: string;
  startedAtMs: number;
  finishedAtMs: number;
  ttftMs?: number;
  finishReason: FinishReason | undefined;
}

/** Derive the provider id from a provider-qualified model ("anthropic/x" → "anthropic"). */
export function providerFromModel(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(0, slash);
}

/**
 * Build the canonical record from the pre-built `UsageRecord` + the measured timing,
 * plus the optional (gated) content slice. Pure: composes, never re-derives.
 */
export function toEmissionRecord(
  usage: UsageRecord,
  timing: EmissionTiming,
  content?: EmissionContent
): EmissionRecord {
  const metrics: EmissionMetrics = {
    traceId: timing.traceId,
    sessionId: usage.sid,
    tenant: usage.tenant,
    model: usage.model,
    provider: providerFromModel(usage.model),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    reasoningTokens: usage.reasoningTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costUsd: usage.costUsd,
    startedAtMs: timing.startedAtMs,
    finishedAtMs: timing.finishedAtMs,
    latencyMs: timing.finishedAtMs - timing.startedAtMs,
    ttftMs: timing.ttftMs,
    finishReason: timing.finishReason,
  };
  return content ? { metrics, content } : { metrics };
}
