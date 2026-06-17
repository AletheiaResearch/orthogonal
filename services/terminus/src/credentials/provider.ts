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
  private allCache?: Promise<Set<string>>;

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

    // A row that exists but is disabled is terminal — never resurrect it from a
    // Worker secret. Lazy-seed from env only when the vault has no row at all.
    if ((await this.all()).has(ref.providerId)) return null;
    const fromEnv = await this.envResolver.resolve(ref.providerId, ref.envKeys);
    if (!fromEnv) return null;
    await this.deps.vault.putApiKey({ provider: ref.providerId, apiKey: fromEnv.apiKey });
    return { apiKey: fromEnv.apiKey };
  }

  async isEnabled(providerId: string, envKeys?: string[]): Promise<boolean> {
    if (providerId === CODEX_PROVIDER) {
      if ((await this.enabled()).has(CODEX_PROVIDER)) return true;
      if ((await this.all()).has(CODEX_PROVIDER)) return false; // disabled codex row is terminal
      return this.codexSeedable();
    }
    if ((await this.enabled()).has(providerId)) return true;
    if ((await this.all()).has(providerId)) return false; // disabled row — no env fallback
    return this.envResolver.isEnabled(providerId, envKeys);
  }

  private enabled(): Promise<Set<string>> {
    this.enabledCache ??= this.deps.vault.listEnabledProviders().then((ids) => new Set(ids));
    return this.enabledCache;
  }

  private all(): Promise<Set<string>> {
    this.allCache ??= this.deps.vault.listAllProviders().then((ids) => new Set(ids));
    return this.allCache;
  }

  /** Trimmed Codex refresh-token seed from a Worker secret, or undefined when unset. */
  private codexRefreshToken(): string | undefined {
    return trimmedEnv(this.deps.env[CODEX_REFRESH_TOKEN_ENV]);
  }

  private codexSeedable(): boolean {
    return this.codexRefreshToken() !== undefined;
  }

  /** Insert-if-absent seed; idempotent, so it never clobbers a concurrently-rotated token. */
  private async ensureCodexSeeded(): Promise<void> {
    const refreshToken = this.codexRefreshToken();
    if (!refreshToken) return;
    await this.deps.vault.seedCodexCredential({
      refreshToken,
      accountId: trimmedEnv(this.deps.env[CODEX_ACCOUNT_ID_ENV]),
    });
  }
}

function trimmedEnv(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
