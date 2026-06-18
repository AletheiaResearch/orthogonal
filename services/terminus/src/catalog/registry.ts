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

/**
 * Non-default credential brokering for a provider. Absent for ordinary
 * models.dev providers (platform key from the vault / Worker secret). `codex-oauth`
 * marks a synthetic provider whose credential is a ChatGPT/Codex OAuth access token
 * that Terminus owns and refreshes from its own encrypted D1 vault (CON-50) — the
 * `CodexTokenManager`, never a per-request control-plane broker.
 */
export type CredentialMode = "codex-oauth";

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
  /** Synthetic-provider extension (models.dev never sets it); see {@link CredentialMode}. */
  credentialMode?: CredentialMode;
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
  /** Non-default credential brokering (e.g. `codex-oauth`); undefined = platform key. */
  credentialMode?: CredentialMode;
  model: ModelsDevModel;
  provider: ModelsDevProvider;
}

/**
 * Split a provider-qualified model id ("provider/model") at the first slash, so
 * ids like "openrouter/anthropic/claude" keep "anthropic/claude" as the model id.
 * Returns null when the id is unqualified or malformed (no leading provider, or a
 * trailing slash). The single source of truth for the split — both `resolveModelRef`
 * and the guardrail gate (`policy/guardrails.ts`) use it, so the RBAC gate can never
 * disagree with resolution about a request's provider.
 */
export function splitModelId(qualifiedId: string): { providerId: string; modelId: string } | null {
  const slash = qualifiedId.indexOf("/");
  if (slash <= 0 || slash === qualifiedId.length - 1) return null;
  return {
    providerId: qualifiedId.slice(0, slash),
    modelId: qualifiedId.slice(slash + 1),
  };
}

/**
 * Resolve a provider-qualified model id ("provider/model") against the registry.
 * Returns null when the id is unqualified/malformed or the provider/model is unknown.
 */
export function resolveModelRef(
  registry: ModelsDevRegistry,
  qualifiedId: string
): ResolvedModelRef | null {
  const parts = splitModelId(qualifiedId);
  if (!parts) return null;
  const { providerId, modelId } = parts;

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
    credentialMode: provider.credentialMode,
    model,
    provider,
  };
}
