/**
 * models.dev registry types + model resolution (CON-49).
 *
 * The registry (https://models.dev/api.json) is an object keyed by provider id.
 * `provider.api` (the OpenAI-compatible baseURL) is present only for
 * openai-compatible providers; for native providers (anthropic, openai, …) the
 * baseURL is baked into the `@ai-sdk/*` package named by `provider.npm`, so we
 * resolve the adapter from `npm` and treat `api` as a baseURL only when present.
 * A model may carry a per-model `provider` override (npm/api) that supersedes its
 * parent — honored here.
 */

/** Pricing in USD per 1,000,000 tokens. Optional — ~7% of models omit it. */
export interface ModelCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
  reasoning?: number;
  [key: string]: unknown;
}

export interface ModelsDevModel {
  id: string;
  name: string;
  reasoning?: boolean;
  tool_call?: boolean;
  attachment?: boolean;
  temperature?: boolean;
  limit: { context: number; output: number; input?: number };
  modalities: { input: string[]; output: string[] };
  cost?: ModelCost;
  /** Per-model adapter/baseURL override; supersedes the parent provider. */
  provider?: { npm?: string; api?: string };
  [key: string]: unknown;
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  doc?: string;
  /** One or more env-var names the provider's credential can come from. */
  env: string[];
  /** The `@ai-sdk/*` adapter package; defaults to openai-compatible when absent. */
  npm?: string;
  /** OpenAI-compatible baseURL; present only for openai-compatible providers. */
  api?: string;
  models: Record<string, ModelsDevModel>;
}

export type ModelsDevRegistry = Record<string, ModelsDevProvider>;

/** Adapter used when a provider/model declares no `npm` (the OpenRouter-style default). */
export const DEFAULT_PROVIDER_NPM = "@ai-sdk/openai-compatible";

export interface ResolvedModelRef {
  providerId: string;
  modelId: string;
  /** `@ai-sdk/*` adapter package to instantiate. */
  npm: string;
  /** Upstream baseURL (set for openai-compatible adapters / model overrides). */
  baseURL?: string;
  /** Candidate env-var names for the provider credential. */
  envKeys: string[];
  model: ModelsDevModel;
  provider: ModelsDevProvider;
}

/**
 * Resolve a provider-qualified model id ("provider/model") against the registry.
 * Splits at the first slash only, so ids like "openrouter/anthropic/claude" keep
 * "anthropic/claude" as the model id. Returns null when the id is unqualified or
 * the provider/model is unknown.
 */
export function resolveModelRef(
  registry: ModelsDevRegistry,
  qualifiedId: string
): ResolvedModelRef | null {
  const slash = qualifiedId.indexOf("/");
  if (slash <= 0 || slash === qualifiedId.length - 1) return null;

  const providerId = qualifiedId.slice(0, slash);
  const modelId = qualifiedId.slice(slash + 1);

  const provider = registry[providerId];
  if (!provider) return null;
  const model = provider.models?.[modelId];
  if (!model) return null;

  return {
    providerId,
    modelId,
    npm: model.provider?.npm ?? provider.npm ?? DEFAULT_PROVIDER_NPM,
    baseURL: model.provider?.api ?? provider.api,
    envKeys: provider.env ?? [],
    model,
    provider,
  };
}
