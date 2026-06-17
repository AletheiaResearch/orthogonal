/**
 * Upstream-failure classification for the credential fallback loop (CON-71 L1).
 *
 * Distinguishes retryable upstream failures (rate limits, 5xx, transient network)
 * from terminal ones (bad request / bad key / client abort) so a malformed request
 * is never amplified across every credential in the pool, and computes a cooldown
 * window (honoring `Retry-After`) for the failed candidate.
 */
import { APICallError } from "ai";

const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

/** True when trying the next pool candidate could plausibly succeed. */
export function isRetryableUpstreamError(err: unknown): boolean {
  // Client gave up — don't burn the pool retrying for a caller who's gone.
  if (err instanceof Error && err.name === "AbortError") return false;
  // The AI SDK classifies HTTP failures (429/5xx retryable; 400/401/403 not).
  if (APICallError.isInstance(err)) return err.isRetryable === true;
  // Unknown / network error: another candidate may succeed.
  return true;
}

/**
 * Cooldown end (epoch ms) for a failed candidate: honor upstream `Retry-After`
 * (seconds or HTTP-date), else an escalating default backoff, capped.
 */
export function cooldownUntilFromError(err: unknown, nowMs: number, failureCount = 0): number {
  if (APICallError.isInstance(err)) {
    const retryAfter = err.responseHeaders?.["retry-after"];
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return nowMs + Math.min(seconds * 1000, MAX_COOLDOWN_MS);
      const dateMs = Date.parse(retryAfter);
      if (Number.isFinite(dateMs)) return Math.min(dateMs, nowMs + MAX_COOLDOWN_MS);
    }
  }
  const backoff = Math.min(DEFAULT_COOLDOWN_MS * 2 ** Math.max(0, failureCount), MAX_COOLDOWN_MS);
  return nowMs + backoff;
}
