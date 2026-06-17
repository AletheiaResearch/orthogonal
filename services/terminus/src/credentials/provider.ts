/**
 * Credential provider seam (CON-50) — the one place the request path asks "what
 * credential serves this model for this session?".
 *
 * `VaultCredentialProvider` reads from the D1 vault, resolving Codex via the token
 * manager and plain providers by key. Worker-secret provider keys are lazily
 * seeded into the vault on first use, so the vault becomes the runtime source of
 * truth (later replaced/augmented by API ingestion) without a big-bang migration.
 * Node-env app tests inject a fake `CredentialProvider` instead of a real vault.
 */
import type { ResolvedModelRef } from "../catalog/registry";
import { CODEX_PROVIDER, type CredentialVault } from "../db/vault";
import type { CodexTokenManager } from "./codex-manager";
import { EnvKeyResolver } from "./resolver";

const CODEX_REFRESH_TOKEN_ENV = "CODEX_OAUTH_REFRESH_TOKEN";
const CODEX_ACCOUNT_ID_ENV = "CODEX_OAUTH_ACCOUNT_ID";

export interface UpstreamCredential {
  /** Bearer key for the upstream — a provider API key, or a Codex OAuth access token. */
  apiKey: string;
  /** Codex only: the ChatGPT account id for the `ChatGPT-Account-Id` header. */
  accountId?: string;
}

export interface CredentialProvider {
  /** The credential for a model + session, or null if the provider is unconfigured. */
  forModel(ref: ResolvedModelRef, sid: string): Promise<UpstreamCredential | null>;
  /** Whether a provider has (or can seed) a usable credential — for `/v1/models`. */
  isEnabled(providerId: string, envKeys?: string[]): Promise<boolean>;
}

export interface VaultCredentialProviderDeps {
  vault: CredentialVault;
  codex: CodexTokenManager;
  env: Record<string, unknown>;
}

export class VaultCredentialProvider implements CredentialProvider {
  private readonly envResolver: EnvKeyResolver;
  private enabledCache?: Promise<Set<string>>;

  constructor(private readonly deps: VaultCredentialProviderDeps) {
    this.envResolver = new EnvKeyResolver(deps.env);
  }

  async forModel(ref: ResolvedModelRef, _sid: string): Promise<UpstreamCredential | null> {
    if (ref.credentialMode === "codex-oauth") {
      await this.ensureCodexSeeded();
      const token = await this.deps.codex.getAccessToken();
      return token ? { apiKey: token.accessToken, accountId: token.accountId } : null;
    }

    const existing = await this.deps.vault.getCredential(ref.providerId);
    if (existing?.mode === "api_key") return { apiKey: existing.apiKey };

    // Lazy-seed from a Worker secret on first use; the vault is authoritative after.
    const fromEnv = await this.envResolver.resolve(ref.providerId, ref.envKeys);
    if (!fromEnv) return null;
    await this.deps.vault.putApiKey({ provider: ref.providerId, apiKey: fromEnv.apiKey });
    return { apiKey: fromEnv.apiKey };
  }

  async isEnabled(providerId: string, envKeys?: string[]): Promise<boolean> {
    if (providerId === CODEX_PROVIDER) {
      return (await this.enabled()).has(CODEX_PROVIDER) || this.codexSeedable();
    }
    if ((await this.enabled()).has(providerId)) return true;
    return this.envResolver.isEnabled(providerId, envKeys);
  }

  private enabled(): Promise<Set<string>> {
    this.enabledCache ??= this.deps.vault.listEnabledProviders().then((ids) => new Set(ids));
    return this.enabledCache;
  }

  private codexSeedable(): boolean {
    const value = this.deps.env[CODEX_REFRESH_TOKEN_ENV];
    return typeof value === "string" && value.length > 0;
  }

  private async ensureCodexSeeded(): Promise<void> {
    if (!this.codexSeedable()) return;
    if (await this.deps.vault.getCredential(CODEX_PROVIDER)) return;
    const accountIdValue = this.deps.env[CODEX_ACCOUNT_ID_ENV];
    await this.deps.vault.putCodexCredential({
      refreshToken: this.deps.env[CODEX_REFRESH_TOKEN_ENV] as string,
      accountId: typeof accountIdValue === "string" ? accountIdValue : undefined,
    });
  }
}
