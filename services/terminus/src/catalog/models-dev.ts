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

export async function fetchRegistry(
  env: Env,
  fetchImpl: typeof fetch = fetch
): Promise<ModelsDevRegistry> {
  const kv = env.MODELS_CACHE;

  if (kv) {
    const fresh = (await kv.get(FRESH_KEY, "json")) as ModelsDevRegistry | null;
    if (fresh) return fresh;
  }

  try {
    const res = await fetchImpl(env.MODELS_DEV_URL ?? DEFAULT_URL, {
      headers: { "user-agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`models.dev responded ${res.status}`);
    const registry = (await res.json()) as ModelsDevRegistry;

    if (kv) {
      const body = JSON.stringify(registry);
      await kv.put(FRESH_KEY, body, { expirationTtl: FRESH_TTL_SECONDS });
      await kv.put(LAST_GOOD_KEY, body);
    }
    return registry;
  } catch (err) {
    if (kv) {
      const stale = (await kv.get(LAST_GOOD_KEY, "json")) as ModelsDevRegistry | null;
      if (stale) return stale;
    }
    throw upstreamError(
      `Unable to load models.dev catalog: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
