/**
 * Chat completions proxy (CON-48). Accepts an OpenAI Chat Completions request,
 * resolves the model + upstream credential, and proxies through the Vercel AI SDK
 * (`streamText` / `generateText`), re-emitting an OpenAI-compatible streaming SSE
 * or JSON response. Per-call usage is emitted to the sink (session-level via `sid`).
 */
import { type LanguageModelUsage, generateText, streamText } from "ai";

import { withCodexProvider } from "../catalog/codex";
import type { fetchRegistry } from "../catalog/models-dev";
import { type ModelCost, type ResolvedModelRef, resolveModelRef } from "../catalog/registry";
import type { CredentialProvider } from "../credentials/provider";
import { cooldownUntilFromError, isRetryableUpstreamError } from "../credentials/retry";
import { type CredentialOwner, PLATFORM_OWNER } from "../db/vault";
import {
  badRequest,
  errorResponse,
  forbiddenModel,
  providerCooledDown,
  providerUnconfigured,
  toGatewayError,
  unknownModel,
} from "../errors";
import type { TerminusContext } from "../middleware/auth";
import { toModelMessages, toToolSet } from "../openai/messages";
import {
  type ChunkMeta,
  type CompletionParts,
  mapFinishReason,
  type OpenAIChatRequest,
  toOpenAIChatCompletion,
  toOpenAIChatStream,
} from "../openai/protocol";
import type { GuardrailPolicy } from "../policy/blob";
import { applyGuardrails } from "../policy/guardrails";
import {
  type BuildLanguageModelOptions,
  buildLanguageModel,
  codexProviderOptions,
} from "../providers/router";
import type { TraceRecord, TraceSink } from "../trace/sink";
import { computeCostUsd } from "../usage/pricing";
import type { UsageRecord, UsageSink } from "../usage/sink";
import { asReadable, peekStream } from "./stream-fallback";

export interface ChatDeps {
  loadRegistry: typeof fetchRegistry;
  usageSink: UsageSink;
  /**
   * Raw trace content-capture sink (CON-61). Present ONLY when the operator flag
   * `TERMINUS_TRACE_CAPTURE_ENABLED` is on (gated at the handler edge in `index.ts`),
   * so chat capture is enabled iff this is set — undefined = zero content handling.
   * Content is raw/unsanitized; see `trace/sink.ts`.
   */
  traceSink?: TraceSink;
  /** Resolves the upstream credential for a model + session (vault-backed in prod). */
  credentials: CredentialProvider;
  /**
   * Active guardrail policy source (CON-71 L2). Undefined = no enforcement
   * (pass-through). `getActivePolicy` returns null when none is configured and
   * throws a 503 `GatewayError` when a configured policy can't be loaded (fail-closed).
   */
  policy?: { getActivePolicy(owner: CredentialOwner): Promise<GuardrailPolicy | null> };
  /** Injectable for tests; defaults to the real provider router. */
  buildModel?: (
    ref: ResolvedModelRef,
    apiKey: string,
    opts?: BuildLanguageModelOptions
  ) => ReturnType<typeof buildLanguageModel>;
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

  try {
    // L2 guardrail policy (CON-71): gate model/provider + clamp output tokens BEFORE resolution,
    // so a 403 precedes a 404 and denied models don't reveal existence. Pass-through when no
    // policy is configured; fail-closed (503) if a configured one can't load. Never rewrites
    // body.model — the served model is always the requested one.
    const requestedMaxOutput = body.max_completion_tokens ?? body.max_tokens;
    const policy = (await deps.policy?.getActivePolicy(PLATFORM_OWNER)) ?? null;
    let effectiveMaxOutput = policy
      ? applyGuardrails(body.model, requestedMaxOutput, policy).maxOutputTokens
      : requestedMaxOutput;

    // Signed-claim coarse bound (defense-in-depth) — stacks on the policy gate, never widens it.
    // Empty allowed_models means unrestricted (single-tenant rollout default).
    if (claims.allowed_models.length > 0 && !claims.allowed_models.includes(body.model)) {
      return errorResponse(forbiddenModel(body.model));
    }

    const registry = withCodexProvider(await deps.loadRegistry(c.env));
    const ref = resolveModelRef(registry, body.model);
    if (!ref) return errorResponse(unknownModel(body.model));
    effectiveMaxOutput =
      effectiveMaxOutput !== undefined && ref.model.limit?.output !== undefined
        ? Math.min(effectiveMaxOutput, ref.model.limit.output)
        : effectiveMaxOutput;

    const candidates = await deps.credentials.forModelCandidates(ref, claims.sid);
    if (candidates.length === 0) {
      // Distinguish "no credential at all" (502) from "credentials exist but all are
      // cooling down" (503 transient) — a rate-limit/health window must not read as
      // misconfiguration to clients/alerts.
      const configured = await deps.credentials.isEnabled(ref.providerId, ref.envKeys);
      return errorResponse(
        configured ? providerCooledDown(ref.providerId) : providerUnconfigured(ref.providerId)
      );
    }

    const nowMs = deps.now?.() ?? Date.now();
    const meta: ChunkMeta = {
      id: `chatcmpl-${deps.newId?.() ?? crypto.randomUUID()}`,
      created: Math.floor(nowMs / 1000),
      model: body.model,
    };

    const buildModel = deps.buildModel ?? buildLanguageModel;
    // Build request-derived options ONCE, before the candidate loop: a malformed request
    // (e.g. a tool message with no matching tool_call_id) must fail fast as a 400, not walk
    // the whole credential pool cooling down healthy keys (GatewayError is terminal in retry).
    const requestMessages = toModelMessages(body.messages);
    const requestTools = toToolSet(body.tools);
    const callOptionsFor = (model: ReturnType<typeof buildLanguageModel>) => ({
      model,
      messages: requestMessages,
      tools: requestTools,
      temperature: body.temperature,
      topP: body.top_p,
      maxOutputTokens: effectiveMaxOutput,
      stopSequences: typeof body.stop === "string" ? [body.stop] : body.stop,
      abortSignal: c.req.raw.signal,
      // Codex (ChatGPT-backend Responses) requires store:false + encrypted-reasoning options.
      ...(ref.credentialMode === "codex-oauth"
        ? { providerOptions: codexProviderOptions(claims.sid) }
        : {}),
    });

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

    // Best-effort health writes, off the hot path: never fail a good completion.
    const background = (p: Promise<void> | undefined): void => {
      if (!p) return;
      const guarded = p.catch(() => {});
      try {
        c.executionCtx.waitUntil(guarded);
      } catch {
        // no ExecutionContext (unit tests); the write still runs to completion
      }
    };

    // Cool down a candidate on a *retryable* upstream error (best-effort, off the hot
    // path). Returns true if retryable (cooled down), false if terminal. Shared by the
    // streaming peek loop, the streaming mid-stream error, and the non-streaming loop.
    const coolDownIfRetryable = (candidate: (typeof candidates)[number], err: unknown): boolean => {
      if (!isRetryableUpstreamError(err)) return false;
      // Fresh clock at failure time (not request-start nowMs): a slow failure would
      // otherwise write a cooldown that is already in the past.
      background(
        deps.credentials.recordFailure?.(
          candidate.id,
          cooldownUntilFromError(err, deps.now?.() ?? Date.now(), candidate.failureCount)
        )
      );
      return true;
    };

    // Raw trace content-capture (CON-61), active ONLY when a sink is wired (operator
    // flag on). Best-effort and fully isolated: the try/catch wraps BOTH the record
    // build AND the dispatch, because the streaming path calls this from inside the
    // generator during a stream pull — a throw here must never corrupt the live
    // response. Content is raw/unsanitized; a real consumer must sanitize first
    // (see trace/sink.ts). Fires only on a successful completion (the `finish` part).
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
          finishReason: mapFinishReason(parts.finishReason),
        };
        const write = deps.traceSink.record(trace).catch((e) => {
          console.error(
            JSON.stringify({
              event: "terminus.trace.sink_error",
              message: e instanceof Error ? e.message : String(e),
            })
          );
        });
        try {
          c.executionCtx.waitUntil(write);
        } catch {
          // no ExecutionContext (unit tests); the record still runs to completion
        }
      } catch (e) {
        console.error(
          JSON.stringify({
            event: "terminus.trace.capture_error",
            message: e instanceof Error ? e.message : String(e),
          })
        );
      }
    };

    // Streaming: peek-first-chunk fallback (CON-74). Mirror the non-streaming candidate
    // loop — drive each candidate's stream until the first client-output part (commit)
    // or a pre-output error. A retryable pre-output error rotates to the next candidate;
    // a terminal one throws → clean HTTP status (nothing was streamed). Once committed, a
    // later error surfaces mid-stream (no restart → no double-billing / duplicated output).
    if (body.stream) {
      let lastStreamError: unknown;
      for (const candidate of candidates) {
        const cred = await candidate.resolve();
        if (!cred) continue;
        const model = buildModel(ref, cred.apiKey, {
          accountId: cred.accountId,
          sessionId: claims.sid,
        });
        // Gateway owns streaming fallback now, so disable the SDK's same-target retry
        // (it would add hidden backoff before the peek detects the failure).
        const result = streamText({ ...callOptionsFor(model), maxRetries: 0 });
        const peeked = await peekStream(result.fullStream);
        if (peeked.kind === "error") {
          if (!coolDownIfRetryable(candidate, peeked.error)) throw peeked.error;
          lastStreamError = peeked.error;
          continue;
        }
        const sse = toOpenAIChatStream(
          peeked.stream,
          meta,
          (usage) => {
            void emit(usage);
            background(deps.credentials.recordSuccess?.(candidate.id));
          },
          // Mid-stream error after commit: no fallback, just cool down for the next request.
          (err) => void coolDownIfRetryable(candidate, err),
          // Trace capture (CON-61): accumulate + capture on finish, only when a sink is
          // wired. Omitted when off so the mapper does no accumulation (zero overhead).
          // The peeked first chunk is re-yielded into this stream (CON-74 `drain`), so
          // accumulation sees every client-output part including chunk 1.
          deps.traceSink ? captureTrace : undefined
        );
        return new Response(asReadable(sse), {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      }
      throw lastStreamError ?? new Error("all upstream streaming candidates failed");
    }

    // Non-streaming: try candidates in priority/weight order; on a retryable upstream
    // error cool the candidate down and fall back to the next. Fail closed if all fail.
    let lastError: unknown;
    for (const candidate of candidates) {
      const cred = await candidate.resolve();
      if (!cred) continue;
      const model = buildModel(ref, cred.apiKey, {
        accountId: cred.accountId,
        sessionId: claims.sid,
      });
      try {
        // The gateway owns resilience via cross-candidate fallback, so disable the SDK's
        // same-target retry (it would add hidden backoff before we fall back).
        const result = await generateText({ ...callOptionsFor(model), maxRetries: 0 });
        background(deps.credentials.recordSuccess?.(candidate.id));
        const completion: CompletionParts = {
          content: result.text,
          toolCalls: result.toolCalls,
          finishReason: result.finishReason,
          usage: result.totalUsage,
        };
        await emit(result.totalUsage);
        captureTrace(completion);
        return Response.json(toOpenAIChatCompletion(meta, completion));
      } catch (err) {
        if (!coolDownIfRetryable(candidate, err)) throw err;
        lastError = err;
      }
    }
    throw lastError ?? new Error("all upstream candidates failed");
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
