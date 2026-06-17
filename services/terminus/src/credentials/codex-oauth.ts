/**
 * Codex (ChatGPT) OAuth token refresh (CON-50).
 *
 * Ported from the control plane's `auth/openai.ts` so Terminus can be the sole
 * refresher of its own ChatGPT account. A plain HTTPS POST to the OpenAI token
 * endpoint — no browser/loopback (that's only for the initial login). The
 * rotated (single-use) refresh token is returned for the caller to persist.
 */

const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** Bound the refresh so a stalled upstream can't pin a request or the cron invocation. */
const CODEX_REFRESH_TIMEOUT_MS = 10_000;

/** Thrown on a 401 — the refresh token was already rotated (e.g. by a concurrent writer). */
export class CodexRefreshUnauthorizedError extends Error {}

export interface CodexRefreshResult {
  accessToken: string;
  /** The rotated, single-use refresh token — persist it. */
  refreshToken: string;
  accountId?: string;
  expiresInSeconds?: number;
}

interface OpenAITokenResponse {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

/** Refresh a Codex access token from a refresh token. `fetchImpl` is injectable for tests. */
export async function refreshCodexToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<CodexRefreshResult> {
  const response = await fetchImpl(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OPENAI_CLIENT_ID,
    }).toString(),
    signal: AbortSignal.timeout(CODEX_REFRESH_TIMEOUT_MS),
  });

  if (response.status === 401) {
    throw new CodexRefreshUnauthorizedError("OpenAI token refresh unauthorized (401)");
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`OpenAI token refresh failed: ${response.status} ${body}`);
  }

  const tokens = (await response.json()) as OpenAITokenResponse;
  // The single-use refresh token must round-trip; persisting an undefined one
  // would brick the account. Validate rather than trust the upstream JSON shape.
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("OpenAI token refresh response missing access_token or refresh_token");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accountId: extractAccountId(tokens),
    expiresInSeconds: tokens.expires_in,
  };
}

/** Extract the ChatGPT account id from the id/access token JWT claims. */
function extractAccountId(tokens: OpenAITokenResponse): string | undefined {
  for (const field of [tokens.id_token, tokens.access_token] as const) {
    if (!field) continue;
    try {
      const parts = field.split(".");
      if (parts.length < 2) continue;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))) as {
        chatgpt_account_id?: string;
        "https://api.openai.com/auth"?: { chatgpt_account_id?: string };
        organizations?: Array<{ id?: string }>;
      };
      const accountId =
        payload.chatgpt_account_id ??
        payload["https://api.openai.com/auth"]?.chatgpt_account_id ??
        payload.organizations?.[0]?.id;
      if (accountId) return String(accountId);
    } catch {
      // malformed token segment — try the next field
    }
  }
  return undefined;
}
