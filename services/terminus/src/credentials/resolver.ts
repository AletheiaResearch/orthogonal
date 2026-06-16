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
  /** Resolve the upstream credential for a provider id, or null if unconfigured. */
  resolve(providerId: string): Promise<ResolvedCredential | null>;
  /** Whether the provider has a usable credential (and so should be advertised). */
  isEnabled(providerId: string): Promise<boolean>;
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

  resolve(providerId: string): Promise<ResolvedCredential | null> {
    const apiKey = this.readKey(providerId);
    return Promise.resolve(apiKey ? { apiKey, source: "platform" } : null);
  }

  isEnabled(providerId: string): Promise<boolean> {
    return Promise.resolve(this.readKey(providerId) !== null);
  }

  private readKey(providerId: string): string | null {
    const name = this.options.envVarOverrides?.[providerId] ?? providerEnvVarName(providerId);
    const value = this.env[name];
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}
