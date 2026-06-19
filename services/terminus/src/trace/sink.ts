/**
 * Trace content-capture seam (CON-61) — sibling of the usage seam (`usage/sink.ts`).
 *
 * On a *successful* completion the gateway can hand the raw request/response content
 * — the prompt messages and the assistant's text + tool calls — to this sink, bundled
 * with the usage/cost record it already computes (`usage: UsageRecord`). The default
 * sink is a no-op; capture is gated default-OFF by `TERMINUS_TRACE_CAPTURE_ENABLED`.
 *
 * ⚠️ RAW, UNSANITIZED CONTENT — READ BEFORE BUILDING A CONSUMER ⚠️
 * A `TraceRecord` carries the user's prompt and the model's output verbatim: PII,
 * secrets, whatever was said. This seam does NO sanitization. Any real consumer
 * (CON-73 broadcast, CON-43 store) MUST run CON-43's sanitizer BEFORE persisting or
 * transmitting a record. Per-session **consent** — distinct from the coarse env flag,
 * which is an operator kill-switch, not user consent — also lands with CON-43.
 * Capturing raw content here is acceptable ONLY because the default sink discards it
 * and the flag is off by default. Do NOT log a `TraceRecord` (unlike `LoggingUsageSink`).
 */
import type { FinishReason } from "ai";

import type { CompletionParts, OpenAIChatMessage } from "../openai/protocol";
import type { UsageRecord } from "../usage/sink";

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
   * Raw AI SDK finish reason, preserved verbatim (NOT coerced to the OpenAI wire enum).
   * Capture fires on the `finish` part, which can carry a non-success reason
   * (`"error"` / `"other"`, or be absent); storing it raw lets a downstream consumer
   * (CON-43) distinguish those from a clean `"stop"`. The seam neither gates nor coerces.
   */
  finishReason: FinishReason | undefined;
}

export interface TraceSink {
  record(trace: TraceRecord): Promise<void>;
}

/**
 * Build a `TraceRecord` from the pre-built usage record, the raw request messages, and
 * the completion content both response paths produce (`CompletionParts`). Pure: the
 * ONLY content mapping the seam performs — the `{ toolCallId, toolName }` → `{ id, name }`
 * tool-call rename, and **verbatim** finish-reason preservation (NOT coerced to the
 * OpenAI wire enum, so a non-success `"error"`/`"other"` or absent reason stays
 * distinguishable downstream). Kept out of the chat route so it is unit-testable with
 * controlled inputs the SDK test mock cannot drive (e.g. a specific finish reason).
 */
export function toTraceRecord(
  usage: UsageRecord,
  requestMessages: OpenAIChatMessage[],
  parts: Pick<CompletionParts, "content" | "toolCalls" | "finishReason">
): TraceRecord {
  return {
    usage,
    requestMessages,
    responseText: parts.content,
    responseToolCalls: parts.toolCalls.map((tc) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      input: tc.input,
    })),
    finishReason: parts.finishReason,
  };
}

/**
 * Default sink: captures NOTHING. Unlike `LoggingUsageSink` it MUST NOT log the
 * record — a `TraceRecord` carries raw, unsanitized request/response content (PII).
 */
export class NoopTraceSink implements TraceSink {
  record(_trace: TraceRecord): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Parse the `TERMINUS_TRACE_CAPTURE_ENABLED` env flag. Default-OFF: on only for an
 * explicit `"true"` / `"1"` (case-insensitive, trimmed); anything else — including
 * unset, `"false"`, `"0"` — is off.
 */
export function parseTraceCaptureEnabled(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "true" || v === "1";
}
