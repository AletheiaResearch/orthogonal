/**
 * Provider router (CON-48): turn a resolved model ref + credential into a Vercel
 * AI SDK language model.
 *
 * The default path is dynamic and OpenRouter-style — any provider flows through
 * `@ai-sdk/openai-compatible` using its registry baseURL. Code "overrides" exist
 * only for adapters that need provider-specific handling (Anthropic, OpenAI today;
 * Codex OAuth later). An unsupported native adapter is an explicit, clear failure
 * rather than a silent mis-route.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { ResolvedModelRef } from "../catalog/registry";
import { codexAccountMissing, missingBaseURL, unsupportedProvider } from "../errors";

export interface BuildLanguageModelOptions {
  /** Codex OAuth account id → `ChatGPT-Account-Id` request header. */
  accountId?: string;
  /** Session id → `session_id` request header (Codex usage attribution). */
  sessionId?: string;
  /** Custom fetch — the AI SDK transport injection point; defaults to global fetch. */
  fetch?: typeof fetch;
}

/**
 * Per-call provider options the ChatGPT-backend Codex Responses endpoint requires
 * but the AI SDK does not default to. Verified against openai/codex (Rust) and
 * OpenCode core: `store:false` (the backend rejects stored responses), encrypted
 * reasoning echo for `store:false` continuity, an auto reasoning summary, and a
 * stable cache key. Passed to `streamText`/`generateText`, not baked into the model.
 */
export function codexProviderOptions(sessionId?: string) {
  return {
    openai: {
      store: false,
      include: ["reasoning.encrypted_content"],
      reasoningSummary: "auto",
      ...(sessionId ? { promptCacheKey: sessionId } : {}),
    },
  } satisfies Record<string, Record<string, unknown>>;
}

// Return type is inferred as the concrete AI SDK language model (V3), which is
// assignable to `streamText`'s `LanguageModel` param while still exposing
// `.modelId` / `.specificationVersion` to callers and tests.
export function buildLanguageModel(
  ref: ResolvedModelRef,
  apiKey: string,
  opts: BuildLanguageModelOptions = {}
) {
  // Codex OAuth: ChatGPT-backed Responses API. The access token rides as the
  // bearer key; account-id/originator/session_id replicate the proven sandbox
  // plugin's headers exactly. Required body deviations come from codexProviderOptions.
  if (ref.credentialMode === "codex-oauth") {
    if (!ref.baseURL) throw missingBaseURL(ref.providerId);
    // Codex/responses rejects requests without the account header — fail fast on an
    // incomplete credential rather than proxying a guaranteed-400 upstream request.
    if (!opts.accountId) throw codexAccountMissing();
    return createOpenAI({
      apiKey,
      baseURL: ref.baseURL,
      headers: {
        "ChatGPT-Account-Id": opts.accountId,
        originator: "opencode",
        ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
      },
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    }).responses(ref.modelId);
  }

  switch (ref.npm) {
    case "@ai-sdk/anthropic":
      return createAnthropic({ apiKey, ...(ref.baseURL ? { baseURL: ref.baseURL } : {}) })(
        ref.modelId
      );

    case "@ai-sdk/openai":
      return createOpenAI({ apiKey, ...(ref.baseURL ? { baseURL: ref.baseURL } : {}) })(
        ref.modelId
      );

    case "@ai-sdk/openai-compatible": {
      if (!ref.baseURL) throw missingBaseURL(ref.providerId);
      return createOpenAICompatible({
        name: ref.providerId,
        baseURL: ref.baseURL,
        apiKey,
        includeUsage: true,
      })(ref.modelId);
    }

    default:
      throw unsupportedProvider(ref.npm, ref.providerId);
  }
}
