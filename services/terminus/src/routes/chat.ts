/**
 * Chat completions proxy (CON-48). Accepts an OpenAI Chat Completions request,
 * resolves the model + upstream credential, and proxies through the Vercel AI SDK
 * (`streamText` / `generateText`), re-emitting an OpenAI-compatible streaming SSE
 * or JSON response. Per-call usage is emitted to the sink (session-level via `sid`).
 */
import { type LanguageModelUsage, generateText, streamText } from "ai";

import type { fetchRegistry } from "../catalog/models-dev";
import { type ModelCost, type ResolvedModelRef, resolveModelRef } from "../catalog/registry";
import { EnvKeyResolver } from "../credentials/resolver";
import {
  badRequest,
  errorResponse,
  forbiddenModel,
  providerUnconfigured,
  toGatewayError,
  unknownModel,
} from "../errors";
import type { TerminusContext } from "../middleware/auth";
import { toModelMessages, toToolSet } from "../openai/messages";
import {
  type ChunkMeta,
  type OpenAIChatRequest,
  toOpenAIChatCompletion,
  toOpenAIChatStream,
} from "../openai/protocol";
import { buildLanguageModel } from "../providers/router";
import { computeCostUsd } from "../usage/pricing";
import type { UsageRecord, UsageSink } from "../usage/sink";

export interface ChatDeps {
  loadRegistry: typeof fetchRegistry;
  usageSink: UsageSink;
  /** Injectable for tests; defaults to the real provider router. */
  buildModel?: (ref: ResolvedModelRef, apiKey: string) => ReturnType<typeof buildLanguageModel>;
  /** Injectable clock (epoch ms) for deterministic tests. */
  now?: () => number;
  /** Injectable id source for deterministic tests. */
  newId?: () => string;
}

export async function chatCompletions(c: TerminusContext, deps: ChatDeps): Promise<Response> {
  const claims = c.get("claims");

  let body: OpenAIChatRequest;
  try {
    body = (await c.req.json()) as OpenAIChatRequest;
  } catch {
    return errorResponse(badRequest("request body is not valid JSON"));
  }
  if (
    !body ||
    typeof body.model !== "string" ||
    !Array.isArray(body.messages) ||
    (body.stream !== undefined && typeof body.stream !== "boolean")
  ) {
    return errorResponse(badRequest("`model` (string) and `messages` (array) are required"));
  }

  // Empty allowed_models means unrestricted (single-tenant rollout default).
  if (claims.allowed_models.length > 0 && !claims.allowed_models.includes(body.model)) {
    return errorResponse(forbiddenModel(body.model));
  }

  try {
    const registry = await deps.loadRegistry(c.env);
    const ref = resolveModelRef(registry, body.model);
    if (!ref) return errorResponse(unknownModel(body.model));

    const resolver = new EnvKeyResolver(c.env);
    const credential = await resolver.resolve(ref.providerId, ref.envKeys);
    if (!credential) return errorResponse(providerUnconfigured(ref.providerId));

    const model = (deps.buildModel ?? buildLanguageModel)(ref, credential.apiKey);
    const nowMs = deps.now?.() ?? Date.now();
    const meta: ChunkMeta = {
      id: `chatcmpl-${deps.newId?.() ?? crypto.randomUUID()}`,
      created: Math.floor(nowMs / 1000),
      model: body.model,
    };

    const callOptions = {
      model,
      messages: toModelMessages(body.messages),
      tools: toToolSet(body.tools),
      temperature: body.temperature,
      topP: body.top_p,
      maxOutputTokens: body.max_completion_tokens ?? body.max_tokens,
      stopSequences: typeof body.stop === "string" ? [body.stop] : body.stop,
      abortSignal: c.req.raw.signal,
    };

    const emit = (usage: LanguageModelUsage): Promise<void> => {
      // Metering is best-effort: a sink rejection must never fail a successful
      // completion, so swallow+log here and keep the returned promise non-rejecting.
      const record = deps.usageSink
        .record(usageRecord(claims, body.model, usage, nowMs, ref.model.cost))
        .catch((e) => {
          console.error(
            JSON.stringify({
              event: "terminus.usage.sink_error",
              message: e instanceof Error ? e.message : String(e),
            })
          );
        });
      try {
        // Extend the Worker's lifetime past the response so the (fire-and-forget,
        // for streaming) usage write completes. `c.executionCtx` throws when no
        // ExecutionContext exists (unit tests / non-Worker runtimes) — harmless there.
        c.executionCtx.waitUntil(record);
      } catch {
        // no ExecutionContext; the record still runs to completion
      }
      return record;
    };

    if (body.stream) {
      const result = streamText(callOptions);
      const sse = toOpenAIChatStream(result.fullStream, meta, (usage) => void emit(usage));
      return new Response(asReadable(sse), {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    const result = await generateText(callOptions);
    await emit(result.totalUsage);
    return Response.json(
      toOpenAIChatCompletion(meta, {
        content: result.text,
        toolCalls: result.toolCalls,
        finishReason: result.finishReason,
        usage: result.totalUsage,
      })
    );
  } catch (err) {
    return errorResponse(toGatewayError(err));
  }
}

function usageRecord(
  claims: { sid: string; tenant: string | null },
  model: string,
  usage: LanguageModelUsage,
  createdAt: number,
  cost: ModelCost | undefined
): UsageRecord {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  return {
    sid: claims.sid,
    tenant: claims.tenant,
    model,
    inputTokens,
    outputTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
    costUsd: computeCostUsd({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }, cost),
    createdAt,
  };
}

function asReadable(gen: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await gen.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await gen.return?.(undefined);
    },
  });
}
