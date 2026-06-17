/**
 * Cloudflare Worker bindings for the Terminus LLM gateway.
 *
 * Provider API keys are NOT enumerated here: they are resolved dynamically by
 * environment-variable name (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
 * `OPENROUTER_API_KEY`) so a new provider can be enabled by adding a secret with
 * no code change. See `credentials/resolver.ts`. The index signature lets the
 * resolver read those keys off `env` while keeping the named bindings typed.
 */
export interface Env {
  /** HS256 secret used to verify the short-lived sandbox gateway token (CON-52). */
  TERMINUS_JWT_SECRET: string;

  /** D1 database backing the credential vault (CON-50). */
  DB: D1Database;

  /** Base64 AES-256 key encrypting vault secrets at rest (CON-50). */
  CREDENTIALS_ENCRYPTION_KEY: string;

  /** Bearer secret for the platform credential ingestion/admin API (CON-70). */
  TERMINUS_ADMIN_SECRET?: string;

  /** KV namespace caching the fetched models.dev registry (CON-49). */
  MODELS_CACHE?: KVNamespace;

  /** Override for the models.dev registry URL (defaults to https://models.dev/api.json). */
  MODELS_DEV_URL?: string;

  /** Deployment label (dev / staging / production). */
  DEPLOYMENT_NAME?: string;

  /** Log level override. */
  LOG_LEVEL?: string;

  /** Dynamic provider API keys + any other string/binding values. */
  [key: string]: string | KVNamespace | Fetcher | D1Database | undefined;
}
