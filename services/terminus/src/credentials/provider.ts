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
import { CODEX_PROVIDER, PLATFORM_OWNER, type CredentialVault } from "../db/vault";
import type { CodexTokenManager } from "./codex-manager";
import { EnvKeyResolver } from "./resolver";
import { orderCandidates } from "./selection";

const CODEX_REFRESH_TOKEN_ENV = "CODEX_OAUTH_REFRESH_TOKEN";
const CODEX_ACCOUNT_ID_ENV = "CODEX_OAUTH_ACCOUNT_ID";

export interface UpstreamCredential {
  /** Bearer key for the upstream — a provider API key, or a Codex OAuth access token. */
  apiKey: string;
  /** Codex only: the ChatGPT account id for the `ChatGPT-Account-Id` header. */
  accountId?: string;
}

/** Stable synthetic id for the (single) Codex candidate — no vault row to record against. */
const CODEX_CANDIDATE_ID = "codex";

/** One ordered upstream candidate; `resolve()` decrypts/materializes it when attempted. */
export interface CredentialCandidate {
  /** Vault row id (or the synthetic Codex id) — used by recordSuccess/recordFailure. */
  id: string;
  /** Failures recorded for this credential so far — drives escalating cooldown backoff. */
  failureCount: number;
  resolve(): Promise<UpstreamCredential | null>;
}

export interface CredentialProvider {
  /** The first/only credential for a model + session, or null if unconfigured (back-compat). */
  forModel(ref: ResolvedModelRef, sid: string): Promise<UpstreamCredential | null>;
  /** Ordered upstream candidates (LB pool + fallback) for a model + session. */
  forModelCandidates(ref: ResolvedModelRef, sid: string): Promise<CredentialCandidate[]>;
  /** Whether a provider has (or can seed) a usable credential — for `/v1/models`. */
  isEnabled(providerId: string, envKeys?: string[]): Promise<boolean>;
  /** Best-effort: clear a candidate's failure state after a success. */
  recordSuccess?(id: string): Promise<void>;
  /** Best-effort: mark a candidate failed (set cooldown). */
  recordFailure?(id: string, cooldownUntilMs: number | null): Promise<void>;
}

export interface VaultCredentialProviderDeps {
  vault: CredentialVault;
  codex: CodexTokenManager;
  env: Record<string, unknown>;
  /** Injectable clock (epoch ms) for deterministic cooldown filtering in tests. */
  now?: () => number;
}

export class VaultCredentialProvider implements CredentialProvider {
  private readonly envResolver: EnvKeyResolver;
  private readonly now: () => number;
  private enabledCache?: Promise<Set<string>>;
  private allCache?: Promise<Set<string>>;

  constructor(private readonly deps: VaultCredentialProviderDeps) {
    this.envResolver = new EnvKeyResolver(deps.env);
    this.now = deps.now ?? (() => Date.now());
  }

  async forModel(ref: ResolvedModelRef, sid: string): Promise<UpstreamCredential | null> {
    const [first] = await this.forModelCandidates(ref, sid);
    return first ? first.resolve() : null;
  }

  async forModelCandidates(ref: ResolvedModelRef, _sid: string): Promise<CredentialCandidate[]> {
    // The gateway token's tenant claim is null today, so every request resolves
    // against the platform owner; per-tenant routing is a multi-tenancy follow-up.
    const owner = PLATFORM_OWNER;

    if (ref.credentialMode === "codex-oauth") {
      await this.ensureCodexSeeded();
      return [
        {
          id: CODEX_CANDIDATE_ID,
          failureCount: 0,
          resolve: async () => {
            const token = await this.deps.codex.getAccessToken();
            return token ? { apiKey: token.accessToken, accountId: token.accountId } : null;
          },
        },
      ];
    }

    let rows = await this.deps.vault.getCredentials(ref.providerId, owner);
    if (rows.length === 0 && !(await this.all()).has(ref.providerId)) {
      // No row at all → lazy-seed from a Worker secret, then re-read for its id.
      // Disabled rows are terminal (present in all()), so they never trigger a reseed.
      const fromEnv = await this.envResolver.resolve(ref.providerId, ref.envKeys);
      if (fromEnv) {
        await this.deps.vault.putApiKey({
          provider: ref.providerId,
          apiKey: fromEnv.apiKey,
          owner,
        });
        rows = await this.deps.vault.getCredentials(ref.providerId, owner);
      }
    }
    if (rows.length === 0) return [];

    // Rows satisfy SelectableCredential (id/priority/weight/cooldownUntilMs), so order them
    // directly; carry failureCount through so the fallback loop can escalate cooldowns.
    return orderCandidates(rows, this.now()).map((row) => ({
      id: row.id,
      failureCount: row.failureCount,
      resolve: async () => {
        const decrypted = await this.deps.vault.decryptById(row.id, owner);
        return decrypted?.mode === "api_key" ? { apiKey: decrypted.apiKey } : null;
      },
    }));
  }

  async recordSuccess(id: string): Promise<void> {
    if (id === CODEX_CANDIDATE_ID) return;
    await this.deps.vault.recordSuccess(id);
  }

  async recordFailure(id: string, cooldownUntilMs: number | null): Promise<void> {
    if (id === CODEX_CANDIDATE_ID) return;
    await this.deps.vault.recordFailure(id, cooldownUntilMs);
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
