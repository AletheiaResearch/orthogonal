/**
 * Synthetic Codex provider (CON-50).
 *
 * `resolveModelRef` only knows models.dev providers, and ChatGPT/Codex is not in
 * that registry — its credential is a per-session ChatGPT OAuth access token the
 * control plane brokers, not a Worker secret. So we inject a synthetic `codex`
 * provider whose models route through the OpenAI **Responses** API at the ChatGPT
 * backend, marked `credentialMode: "codex-oauth"` so the chat path resolves the
 * credential via the control plane and the router builds a Codex-Responses model.
 *
 * The model list mirrors the proven sandbox plugin's allow-list
 * (`packages/sandbox-runtime/.../plugins/codex-auth-plugin.js`); keep them in sync.
 */
import type { ModelsDevModel, ModelsDevProvider, ModelsDevRegistry } from "./registry";

/** Synthetic provider id; codex models are addressed as `codex/<model>`. */
export const CODEX_PROVIDER_ID = "codex";

/**
 * ChatGPT backend Responses baseURL. `@ai-sdk/openai` `.responses(id)` POSTs to
 * `{baseURL}/responses`, i.e. `https://chatgpt.com/backend-api/codex/responses`.
 */
export const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

/** Models served over Codex OAuth (mirrors codex-auth-plugin.js `ALLOWED_MODELS`). */
export const CODEX_ALLOWED_MODELS = [
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.1-codex",
] as const;

function codexModel(id: string): ModelsDevModel {
  return {
    id,
    name: id,
    reasoning: true,
    tool_call: true,
    attachment: false,
    // Subscription-priced: usage is metered as 0 cost (ChatGPT plan, not per-token).
    cost: { input: 0, output: 0 },
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text"], output: ["text"] },
  };
}

/** The synthetic `codex` provider entry. */
export function codexProvider(): ModelsDevProvider {
  const models: Record<string, ModelsDevModel> = {};
  for (const id of CODEX_ALLOWED_MODELS) models[id] = codexModel(id);
  return {
    id: CODEX_PROVIDER_ID,
    name: "ChatGPT Codex",
    env: [],
    npm: "@ai-sdk/openai",
    api: CODEX_BASE_URL,
    credentialMode: "codex-oauth",
    models,
  };
}

/**
 * Return a registry with the synthetic codex provider merged in. Pure — the input
 * registry is not mutated. A real models.dev `codex` entry (should one ever exist)
 * is overridden by the synthetic one so credential brokering stays correct.
 */
export function withCodexProvider(registry: ModelsDevRegistry): ModelsDevRegistry {
  return { ...registry, [CODEX_PROVIDER_ID]: codexProvider() };
}
