/**
 * Provider credential resolution (CON-51).
 *
 * Resolution is dynamic and key-driven (OpenRouter-style): a provider is enabled
 * when a credential for it exists. The `CredentialResolver` interface is the seam
 * for the future — the platform-key `EnvKeyResolver` reads Worker secrets today;
 * a D1/KV-backed store (dashboard-inserted keys, per-tenant, BYOK) swaps in later
 * with no call-site change. Raw provider keys live only behind this interface.
 */

export type CredentialSource = "platform" | "tenant" | "byok";

export interface ResolvedCredential {
  apiKey: string;
  source: CredentialSource;
}

export interface CredentialResolver {
  /**
   * Resolve the upstream credential for a provider id, or null if unconfigured.
   * `envKeys` are the provider's models.dev-declared credential env-var names
   * (authoritative); when omitted, implementations fall back to a naming convention.
   */
  resolve(providerId: string, envKeys?: string[]): Promise<ResolvedCredential | null>;
  /** Whether the provider has a usable credential (and so should be advertised). */
  isEnabled(providerId: string, envKeys?: string[]): Promise<boolean>;
}

/**
 * Convention mapping a models.dev provider id to its Worker-secret env var name:
 * uppercase, non-alphanumeric runs collapsed to `_`, suffixed `_API_KEY`.
 * e.g. `openrouter` → `OPENROUTER_API_KEY`, `google-vertex` → `GOOGLE_VERTEX_API_KEY`.
 */
export function providerEnvVarName(providerId: string): string {
  return `${providerId.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_API_KEY`;
}

export interface EnvKeyResolverOptions {
  /** Per-provider env-var-name overrides for providers that diverge from the convention. */
  envVarOverrides?: Record<string, string>;
}

/** Resolves provider keys from Worker secrets / environment by naming convention. */
export class EnvKeyResolver implements CredentialResolver {
  constructor(
    private readonly env: Record<string, unknown>,
    private readonly options: EnvKeyResolverOptions = {}
  ) {}

  resolve(providerId: string, envKeys?: string[]): Promise<ResolvedCredential | null> {
    const apiKey = this.readKey(providerId, envKeys);
    return Promise.resolve(apiKey ? { apiKey, source: "platform" } : null);
  }

  isEnabled(providerId: string, envKeys?: string[]): Promise<boolean> {
    return Promise.resolve(this.readKey(providerId, envKeys) !== null);
  }

  /**
   * Candidate env-var names, in precedence order: an explicit per-provider override,
   * then the provider's models.dev-declared `env` names, then the naming convention.
   * Returns the first non-empty value found.
   */
  private readKey(providerId: string, envKeys?: string[]): string | null {
    const override = this.options.envVarOverrides?.[providerId];
    const candidates = override
      ? [override]
      : envKeys && envKeys.length > 0
        ? envKeys
        : [providerEnvVarName(providerId)];

    for (const name of candidates) {
      const value = this.env[name];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
  }
}
