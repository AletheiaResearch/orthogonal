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
import { CODEX_PROVIDER, type CredentialVault } from "../db/vault";
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

export interface CodexTokenManagerOptions {
  /** Refresh implementation (injectable for tests); defaults to the live OpenAI call. */
  refresh?: (refreshToken: string) => Promise<CodexRefreshResult>;
  /** Injectable clock (epoch ms). */
  now?: () => number;
}

export class CodexTokenManager {
  private readonly refresh: (refreshToken: string) => Promise<CodexRefreshResult>;
  private readonly now: () => number;

  constructor(
    private readonly vault: CredentialVault,
    options: CodexTokenManagerOptions = {}
  ) {
    this.refresh = options.refresh ?? refreshCodexToken;
    this.now = options.now ?? (() => Date.now());
  }

  /** A live Codex access token + account id, or null when Codex isn't configured. */
  async getAccessToken(): Promise<CodexAccessToken | null> {
    const cred = await this.vault.getCredential(CODEX_PROVIDER);
    if (!cred || cred.mode !== "codex-oauth") return null;
    if (cred.accessToken && this.isFresh(cred.expiresAtMs)) {
      return { accessToken: cred.accessToken, accountId: cred.accountId };
    }
    return this.rotate(cred.refreshToken, cred.accountId);
  }

  /** Cron entry point: refresh the Codex token if it's missing or nearing expiry. */
  async refreshIfNearExpiry(): Promise<void> {
    const cred = await this.vault.getCredential(CODEX_PROVIDER);
    if (!cred || cred.mode !== "codex-oauth") return;
    if (cred.accessToken && this.isFresh(cred.expiresAtMs)) return;
    await this.rotate(cred.refreshToken, cred.accountId);
  }

  private isFresh(expiresAtMs: number | undefined): boolean {
    return expiresAtMs !== undefined && this.now() < expiresAtMs - CODEX_REFRESH_BUFFER_MS;
  }

  private async rotate(
    refreshToken: string,
    fallbackAccountId: string | undefined
  ): Promise<CodexAccessToken | null> {
    let result: CodexRefreshResult;
    try {
      result = await this.refresh(refreshToken);
    } catch (err) {
      if (err instanceof CodexRefreshUnauthorizedError) {
        // The single-use token was already rotated — adopt the concurrent writer's token.
        const reread = await this.vault.getCredential(CODEX_PROVIDER);
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
      expiresAtMs:
        this.now() + (result.expiresInSeconds ?? CODEX_DEFAULT_EXPIRES_IN_SECONDS) * 1000,
    });
    return { accessToken: result.accessToken, accountId };
  }
}
