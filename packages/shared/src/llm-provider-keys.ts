/**
 * Curated env-var names for raw LLM-provider API keys.
 *
 * When the Terminus LLM gateway is active for a sandbox, no raw provider key may
 * enter it — otherwise a tool (or out-of-band call) could reach a provider
 * directly, bypassing the gateway's auth, routing, and metering. Modal already
 * drops the *platform* `llm_secrets`; this list lets the control plane strip the
 * same class of keys from *user-injected* env vars (repo/global secrets) on the
 * gateway-active path.
 *
 * Curated, not derived: it covers the keys that providers the terminus catalog
 * fronts accept as credentials (convention `<PROVIDER>_API_KEY`, see terminus
 * `providerEnvVarName` + each models.dev provider's declared `env`). It deliberately
 * does NOT strip unrelated `*_API_KEY` secrets (e.g. `STRIPE_API_KEY`).
 *
 * `GOOGLE_API_KEY` is intentionally included even though it is also used for
 * non-LLM Google services (Maps/Cloud): models.dev's `google` provider lists it as
 * a first-class Gemini credential, so in gateway mode the "no provider reachable
 * directly" invariant must win over preserving its other uses. A user who needs a
 * Maps/Cloud key in a gateway-enabled sandbox should store it under a different name.
 *
 * NOTE: a static list can drift from the dynamic models.dev catalog (a newly-fronted
 * provider's key would not be stripped). Deriving this set from the catalog's
 * provider `env` arrays at runtime is the durable fix — tracked as a follow-up.
 */
export const LLM_PROVIDER_API_KEY_ENV_VARS: readonly string[] = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "DEEPSEEK_API_KEY",
  "XAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "TOGETHER_API_KEY",
  "FIREWORKS_API_KEY",
  "PERPLEXITY_API_KEY",
  "COHERE_API_KEY",
  "CEREBRAS_API_KEY",
];

const LLM_PROVIDER_API_KEY_ENV_VAR_SET: ReadonlySet<string> = new Set(
  LLM_PROVIDER_API_KEY_ENV_VARS
);

/**
 * Return a shallow copy of `env` with the curated LLM-provider key vars removed.
 * Pure; case-sensitive (env var names are conventionally uppercase). Apply only
 * when the gateway is active — on the raw-key fallback the user's keys must stay.
 */
export function withoutLlmProviderKeys(env: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!LLM_PROVIDER_API_KEY_ENV_VAR_SET.has(name)) {
      result[name] = value;
    }
  }
  return result;
}
