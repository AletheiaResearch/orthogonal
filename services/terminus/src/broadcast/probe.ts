/** Admin test-connection probe timeout (ms) — bounds an otherwise-unconstrained fetch. */
export const DEFAULT_PROBE_TIMEOUT_MS = 10_000;

/**
 * `fetch` with a local timeout AbortController, for the admin test-connection probe.
 * `testConnection()` (unlike `send()`) gets no dispatcher signal, so without this a slow
 * endpoint blocks the Worker isolate. Aborts after `timeoutMs`; always clears the timer.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
