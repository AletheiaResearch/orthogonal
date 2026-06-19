/**
 * OpenAI Chat Completions wire protocol (CON-48): request types, finish-reason +
 * usage mapping, streaming `chat.completion.chunk` frames, and the non-streaming
 * `chat.completion` body. The streaming mapper is a pure async generator over the
 * AI SDK `fullStream`, so it is fully unit-testable without a model or network.
 */
import type { FinishReason, LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

export interface OpenAIContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAIChatMessage {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content?: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIFunctionTool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  tools?: OpenAIFunctionTool[];
  stop?: string | string[];
}

export type OpenAIFinishReason = "stop" | "length" | "tool_calls" | "content_filter";

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens: number };
  completion_tokens_details?: { reasoning_tokens: number };
}

export function mapFinishReason(reason: FinishReason | undefined): OpenAIFinishReason {
  switch (reason) {
    case "length":
      return "length";
    case "tool-calls":
      return "tool_calls";
    case "content-filter":
      return "content_filter";
    default:
      return "stop";
  }
}

export function mapUsage(usage: LanguageModelUsage): OpenAIUsage {
  const prompt = usage.inputTokens ?? 0;
  const completion = usage.outputTokens ?? 0;
  const out: OpenAIUsage = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage.totalTokens ?? prompt + completion,
  };
  const cached = usage.inputTokenDetails?.cacheReadTokens;
  if (cached != null) out.prompt_tokens_details = { cached_tokens: cached };
  const reasoning = usage.outputTokenDetails?.reasoningTokens;
  if (reasoning != null) out.completion_tokens_details = { reasoning_tokens: reasoning };
  return out;
}

export interface ChunkMeta {
  id: string;
  created: number;
  model: string;
}

interface ChoiceDelta {
  role?: "assistant";
  content?: string;
  tool_calls?: Array<{
    index: number;
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

function chunkFrame(meta: ChunkMeta, delta: ChoiceDelta, finishReason: OpenAIFinishReason | null) {
  return {
    id: meta.id,
    object: "chat.completion.chunk" as const,
    created: meta.created,
    model: meta.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function usageFrame(meta: ChunkMeta, usage: OpenAIUsage) {
  return {
    id: meta.id,
    object: "chat.completion.chunk" as const,
    created: meta.created,
    model: meta.model,
    choices: [],
    usage,
  };
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * True for the `fullStream` part types `toOpenAIChatStream` turns into a client SSE
 * frame: `text-delta` (content), `tool-call` (tool_calls), `finish` (finish_reason +
 * usage). The streaming-fallback peek (CON-74) commits the response on the first such
 * part, so this MUST stay in sync with the part types handled below (drift-guarded by
 * a test). `error` is deliberately excluded — the peek treats it as a retry/fail
 * decision, not a commit.
 */
export function partStartsClientOutput(part: TextStreamPart<ToolSet>): boolean {
  return part.type === "text-delta" || part.type === "tool-call" || part.type === "finish";
}

/**
 * Map an AI SDK `fullStream` to OpenAI `chat.completion.chunk` SSE frames.
 * `onUsage` fires once on finish (for the usage sink); `onError` fires once if the
 * upstream stream errors (so the caller can cool down the failed credential). The
 * streaming-fallback decision happens before this mapper runs (peek-first-chunk,
 * CON-74); once a part reaches here the response has committed. Terminates with
 * `[DONE]`.
 */
export async function* toOpenAIChatStream(
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>,
  meta: ChunkMeta,
  onUsage?: (usage: LanguageModelUsage) => void,
  onError?: (error: unknown) => void
): AsyncGenerator<string> {
  let roleSent = false;
  let toolIndex = 0;

  for await (const part of fullStream) {
    if (part.type === "text-delta") {
      const delta: ChoiceDelta = roleSent
        ? { content: part.text }
        : { role: "assistant", content: part.text };
      roleSent = true;
      yield sse(chunkFrame(meta, delta, null));
    } else if (part.type === "tool-call") {
      const delta: ChoiceDelta = {
        ...(roleSent ? {} : { role: "assistant" }),
        tool_calls: [
          {
            index: toolIndex++,
            id: part.toolCallId,
            type: "function",
            function: { name: part.toolName, arguments: JSON.stringify(part.input ?? {}) },
          },
        ],
      };
      roleSent = true;
      yield sse(chunkFrame(meta, delta, null));
    } else if (part.type === "finish") {
      onUsage?.(part.totalUsage);
      yield sse(chunkFrame(meta, {}, mapFinishReason(part.finishReason)));
      yield sse(usageFrame(meta, mapUsage(part.totalUsage)));
    } else if (part.type === "error") {
      onError?.(part.error);
      yield sse({
        error: {
          message: part.error instanceof Error ? part.error.message : String(part.error),
          type: "api_error",
        },
      });
      return;
    }
  }

  yield "data: [DONE]\n\n";
}

export interface CompletionParts {
  content: string;
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  finishReason: FinishReason | undefined;
  usage: LanguageModelUsage;
}

/** Build a non-streaming `chat.completion` response body. */
export function toOpenAIChatCompletion(meta: ChunkMeta, parts: CompletionParts) {
  const toolCalls = parts.toolCalls.map((tc) => ({
    id: tc.toolCallId,
    type: "function" as const,
    function: { name: tc.toolName, arguments: JSON.stringify(tc.input ?? {}) },
  }));

  return {
    id: meta.id,
    object: "chat.completion" as const,
    created: meta.created,
    model: meta.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: parts.content || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: mapFinishReason(parts.finishReason),
      },
    ],
    usage: mapUsage(parts.usage),
  };
}
