/**
 * Codex token manager (CON-50).
 *
 * Keeps a live Codex access token in the vault. Reads are cheap (return the cached
 * access token until it nears expiry); only then does it rotate via the OpenAI
 * token endpoint and persist the rotated single-use refresh token back to the
 * vault. The cron (`refreshIfNearExpiry`) is the proactive writer; reads are a
 * lazy fallback. Concurrent rotation is handled the proven way — on a 401 the
 * token was already rotated, so re-read the vault and use the fresh token.
 */
import {
  CODEX_PROVIDER,
  type CredentialOwner,
  type CredentialVault,
  PLATFORM_OWNER,
} from "../db/vault";
import {
  type CodexRefreshResult,
  CodexRefreshUnauthorizedError,
  refreshCodexToken,
} from "./codex-oauth";

/** Re-broker this far before the cached token's stated expiry. */
const CODEX_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Fallback access-token lifetime when the endpoint omits `expires_in`. */
const CODEX_DEFAULT_EXPIRES_IN_SECONDS = 3600;

export interface CodexAccessToken {
  accessToken: string;
  accountId?: string;
}

/** Grace before the 401 re-read, to let a concurrent writer's rotation commit to D1. */
const CONCURRENT_ROTATION_GRACE_MS = 500;

export interface CodexTokenManagerOptions {
  /** Refresh implementation (injectable for tests); defaults to the live OpenAI call. */
  refresh?: (refreshToken: string) => Promise<CodexRefreshResult>;
  /** Injectable clock (epoch ms). */
  now?: () => number;
  /** Delay before the 401 re-read (injectable; tests pass 0 to stay fast). */
  rereadDelayMs?: number;
}

export class CodexTokenManager {
  private readonly refresh: (refreshToken: string) => Promise<CodexRefreshResult>;
  private readonly now: () => number;
  private readonly rereadDelayMs: number;

  constructor(
    private readonly vault: CredentialVault,
    options: CodexTokenManagerOptions = {}
  ) {
    this.refresh = options.refresh ?? refreshCodexToken;
    this.now = options.now ?? (() => Date.now());
    this.rereadDelayMs = options.rereadDelayMs ?? CONCURRENT_ROTATION_GRACE_MS;
  }

  /** A live Codex access token + account id for an owner, or null when unconfigured. */
  async getAccessToken(owner: CredentialOwner = PLATFORM_OWNER): Promise<CodexAccessToken | null> {
    const cred = await this.vault.getCredential(CODEX_PROVIDER, owner);
    if (!cred || cred.mode !== "codex-oauth") return null;
    if (cred.accessToken && this.isFresh(cred.expiresAtMs)) {
      return { accessToken: cred.accessToken, accountId: cred.accountId };
    }
    return this.rotate(cred.refreshToken, cred.accountId, owner);
  }

  /**
   * Cron entry point: refresh every near-expiry Codex token across all owners.
   * v1 holds at most one Codex row per owner (label "default"), so this refreshes
   * once per owner; a per-owner failure is isolated (best-effort).
   */
  async refreshIfNearExpiry(): Promise<void> {
    const rows = await this.vault.listCodexRowsNearExpiry(this.now() + CODEX_REFRESH_BUFFER_MS);
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.ownerType}:${row.ownerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await this.refreshOwner({ type: row.ownerType, id: row.ownerId });
    }
  }

  /** Refresh one owner's Codex token if missing/near-expiry; isolated best-effort. */
  private async refreshOwner(owner: CredentialOwner): Promise<void> {
    const cred = await this.vault.getCredential(CODEX_PROVIDER, owner);
    if (!cred || cred.mode !== "codex-oauth") return;
    if (cred.accessToken && this.isFresh(cred.expiresAtMs)) return;
    try {
      await this.rotate(cred.refreshToken, cred.accountId, owner);
    } catch {
      // One account's refresh failure must not block the others.
    }
  }

  private isFresh(expiresAtMs: number | undefined): boolean {
    return expiresAtMs !== undefined && this.now() < expiresAtMs - CODEX_REFRESH_BUFFER_MS;
  }

  private async rotate(
    refreshToken: string,
    fallbackAccountId: string | undefined,
    owner: CredentialOwner
  ): Promise<CodexAccessToken | null> {
    let result: CodexRefreshResult;
    try {
      result = await this.refresh(refreshToken);
    } catch (err) {
      if (err instanceof CodexRefreshUnauthorizedError) {
        // The single-use token was already rotated — adopt the concurrent writer's token.
        // Brief grace first so its rotation has committed to D1 before we re-read.
        if (this.rereadDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.rereadDelayMs));
        }
        const reread = await this.vault.getCredential(CODEX_PROVIDER, owner);
        if (
          reread?.mode === "codex-oauth" &&
          reread.accessToken &&
          reread.refreshToken !== refreshToken &&
          this.isFresh(reread.expiresAtMs)
        ) {
          return { accessToken: reread.accessToken, accountId: reread.accountId };
        }
      }
      throw err;
    }

    const accountId = result.accountId ?? fallbackAccountId;
    await this.vault.putCodexCredential({
      refreshToken: result.refreshToken,
      accessToken: result.accessToken,
      accountId,
      owner,
      expiresAtMs:
        this.now() + (result.expiresInSeconds ?? CODEX_DEFAULT_EXPIRES_IN_SECONDS) * 1000,
    });
    return { accessToken: result.accessToken, accountId };
  }
}
