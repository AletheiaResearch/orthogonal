/**
 * Fetch + cache the models.dev registry (CON-49).
 *
 * Mirrors how OpenCode consumes models.dev: fetch `api.json` directly over HTTP
 * and cache it. We cache in KV with a 1h freshness TTL plus a non-expiring
 * "last-good" copy so a models.dev outage degrades to a stale catalog rather than
 * a hard failure.
 */
import type { Env } from "../env";
import { upstreamError } from "../errors";
import type { ModelsDevRegistry } from "./registry";

const DEFAULT_URL = "https://models.dev/api.json";
const USER_AGENT = "terminus-gateway";
const FRESH_KEY = "models-dev:fresh";
const LAST_GOOD_KEY = "models-dev:last-good";
const FRESH_TTL_SECONDS = 3600;
const REGISTRY_FETCH_TIMEOUT_MS = 10_000;

function logKvError(op: string, err: unknown): void {
  console.error(
    JSON.stringify({
      event: "terminus.models_cache_error",
      op,
      message: err instanceof Error ? err.message : String(err),
    })
  );
}

export async function fetchRegistry(
  env: Env,
  fetchImpl: typeof fetch = fetch
): Promise<ModelsDevRegistry> {
  const kv = env.MODELS_CACHE;

  // Cache reads/writes are best-effort: a KV failure must never break catalog serving.
  if (kv) {
    try {
      const fresh = (await kv.get(FRESH_KEY, "json")) as ModelsDevRegistry | null;
      if (fresh) return fresh;
    } catch (err) {
      logKvError("get-fresh", err);
    }
  }

  try {
    const res = await fetchImpl(env.MODELS_DEV_URL ?? DEFAULT_URL, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(REGISTRY_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`models.dev responded ${res.status}`);
    const registry = (await res.json()) as ModelsDevRegistry;

    if (kv) {
      const body = JSON.stringify(registry);
      try {
        await kv.put(FRESH_KEY, body, { expirationTtl: FRESH_TTL_SECONDS });
      } catch (err) {
        logKvError("put-fresh", err);
      }
      try {
        await kv.put(LAST_GOOD_KEY, body);
      } catch (err) {
        logKvError("put-last-good", err);
      }
    }
    return registry;
  } catch (err) {
    if (kv) {
      try {
        const stale = (await kv.get(LAST_GOOD_KEY, "json")) as ModelsDevRegistry | null;
        if (stale) return stale;
      } catch (kvErr) {
        logKvError("get-last-good", kvErr);
      }
    }
    throw upstreamError(
      `Unable to load models.dev catalog: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
