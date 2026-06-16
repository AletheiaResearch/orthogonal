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
import { missingBaseURL, unsupportedProvider } from "../errors";

// Return type is inferred as the concrete AI SDK language model (V3), which is
// assignable to `streamText`'s `LanguageModel` param while still exposing
// `.modelId` / `.specificationVersion` to callers and tests.
export function buildLanguageModel(ref: ResolvedModelRef, apiKey: string) {
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
