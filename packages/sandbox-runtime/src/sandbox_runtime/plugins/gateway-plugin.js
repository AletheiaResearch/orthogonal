/**
 * Terminus LLM Gateway Plugin for Open-Inspect (CON-53).
 *
 * When the per-session gateway is enabled, the control plane injects
 * GATEWAY_BASE_URL + GATEWAY_TOKEN into the sandbox INSTEAD of raw LLM
 * provider keys. This plugin registers a single OpenCode provider that proxies
 * every model call through Terminus, authenticating with the short-lived
 * gateway JWT and refreshing it via the control plane before it expires.
 *
 * The catalog is fetched live from the gateway's `GET /v1/models` endpoint and
 * the models are keyed so that the wire payload (`body.model`) ends up equal to
 * the provider-qualified id `"provider/model"` (e.g. "anthropic/claude-opus-4-8").
 *
 * Auto-loaded from .opencode/plugins/ when GATEWAY_TOKEN is set (see
 * entrypoint.py). No raw provider key ever enters the sandbox in this mode.
 *
 * ============================================================================
 * !!! UNVERIFIED: config-hook provider-registration path !!!
 *
 * The exact mechanism below — registering an `@ai-sdk/openai-compatible`
 * provider by mutating `config.provider[GATEWAY_PROVIDER_ID]` inside the plugin
 * `config` hook, and attaching the token-refreshing `fetch` via
 * `options.fetch` — has NOT been validated against the pinned OpenCode runtime
 * (opencode-ai@1.14.41; OPENCODE_VERSION in packages/modal-infra/src/images/base.py).
 * It is written from the v1 config schema (@opencode-ai/sdk ProviderConfig:
 * singular `provider` key, `options.baseURL`, per-key ProviderConfig) and the
 * documented plugin `config(input)` hook, but it NEEDS A LIVE SMOKE TEST.
 *
 * Specific things a smoke test MUST confirm:
 *   1. The `config` hook actually receives a mutable merged config whose
 *      `provider` map is honored after the hook returns. If not, fall back to
 *      writing the provider into OPENCODE_CONFIG_CONTENT from entrypoint.py, or
 *      to an `auth`-hook loader returning `{ apiKey, fetch }` (the codex plugin
 *      pattern) keyed to this provider id.
 *   2. Whether `options.fetch` is consumed by the openai-compatible provider as
 *      the request transport. If it is ignored, move the interceptor into an
 *      `auth` loader's returned `fetch` (see codex-auth-plugin.js) instead.
 *   3. ROUTING: model selection must resolve to "<GATEWAY_PROVIDER_ID>/<id>".
 *      entrypoint.py currently sets the default model to "<provider>/<model>"
 *      with NO gateway prefix (start_opencode, opencode_config["model"]). When
 *      the gateway is ON, the selected model must be re-keyed to this provider
 *      (that re-keying lives in control-plane/modal, OUTSIDE this package), or
 *      the default will not route through Terminus. Verify end-to-end that a
 *      prompt actually hits GATEWAY_BASE_URL and not the bare provider.
 *   4. PROVIDER NPM PACKAGE: `npm: "@ai-sdk/openai-compatible"` is resolved by
 *      OpenCode's own runtime package installer, which fetches it from npm on
 *      first use. The sandbox image (packages/modal-infra/src/images/base.py)
 *      deliberately PRE-STAGES opencode deps and skips runtime npm installs; if
 *      the sandbox lacks runtime npm/network for this fetch, the provider fails
 *      to load and — because raw keys are withheld when the gateway is ON — the
 *      session has zero reachable models with no fallback. Pre-stage
 *      "@ai-sdk/openai-compatible" in base.py (OUTSIDE this package) if needed.
 * ============================================================================
 */

// Fixed provider id under which every gateway-routed model is registered.
// Model keys are the provider-qualified ids ("anthropic/claude-opus-4-8"), so
// OpenCode's "<providerID>/<modelID>" selector resolves to
// "gateway/anthropic/claude-opus-4-8" and the wire payload body.model becomes
// "anthropic/claude-opus-4-8" — what Terminus expects.
const GATEWAY_PROVIDER_ID = "gateway";
const GATEWAY_PROVIDER_NAME = "Terminus Gateway";
const GATEWAY_PROVIDER_NPM = "@ai-sdk/openai-compatible";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry
const CATALOG_TIMEOUT_MS = 10_000; // bound the startup catalog fetch so an
// unreachable gateway can't stall OpenCode server readiness indefinitely.
const TOKEN_REFRESH_TIMEOUT_MS = 10_000; // the refresh runs on the model request
// path — a stalled control plane must not hang completions indefinitely.

// In-memory token state (reset on sandbox restart; reseeded from env below).
let cachedToken = null;
let cachedBaseUrl = null;
let cachedExpiresAtMs = 0;

function getSessionId() {
  try {
    const config = JSON.parse(process.env.SESSION_CONFIG || "{}");
    return config.sessionId || config.session_id || "";
  } catch {
    return "";
  }
}

/**
 * Decode the `exp` (epoch SECONDS, per RFC 7519 / gateway-token.ts) from a JWT
 * payload so the in-memory cache knows when the env-provided token expires
 * without forcing an immediate refresh on the first request. Returns ms, or 0.
 */
function decodeJwtExpMs(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const padded = payload.length % 4 === 0 ? payload : payload + "=".repeat(4 - (payload.length % 4));
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json);
    return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Refresh the gateway token via the control plane, mirroring
 * codex-auth-plugin.js's refreshViaControlPlane for env discovery
 * (CONTROL_PLANE_URL, SANDBOX_AUTH_TOKEN, sessionId).
 *
 * POST {CONTROL_PLANE_URL}/sessions/{sessionId}/gateway-token
 *   -> { token: string, base_url: string, expires_in: number }  (seconds)
 */
async function refreshViaControlPlane() {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL;
  const authToken = process.env.SANDBOX_AUTH_TOKEN;
  const sessionId = getSessionId();

  if (!controlPlaneUrl || !authToken || !sessionId) {
    throw new Error(
      "Missing environment for gateway token refresh: " +
        [
          !controlPlaneUrl && "CONTROL_PLANE_URL",
          !authToken && "SANDBOX_AUTH_TOKEN",
          !sessionId && "SESSION_CONFIG.sessionId",
        ]
          .filter(Boolean)
          .join(", ")
    );
  }

  const response = await fetch(`${controlPlaneUrl}/sessions/${sessionId}/gateway-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    signal: AbortSignal.timeout(TOKEN_REFRESH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Gateway token refresh failed (${response.status}): ${body}`);
  }

  return response.json();
}

/**
 * Return a valid gateway token, refreshing via the control plane when the
 * cached one is within REFRESH_BUFFER_MS of expiry.
 */
async function ensureGatewayToken() {
  const now = Date.now();

  if (cachedToken && cachedExpiresAtMs - now > REFRESH_BUFFER_MS) {
    return { token: cachedToken, baseUrl: cachedBaseUrl };
  }

  const result = await refreshViaControlPlane();

  cachedToken = result.token;
  if (result.base_url) cachedBaseUrl = result.base_url;
  // expires_in is SECONDS (control-plane convention for this field); convert to ms.
  cachedExpiresAtMs = now + (result.expires_in ?? 900) * 1000;

  return { token: cachedToken, baseUrl: cachedBaseUrl };
}

/**
 * Fetch the gateway model catalog: GET {baseUrl}/v1/models with the bearer
 * token. Returns the array of model entries (OpenAI `/models`-shaped: { data }).
 */
async function fetchCatalog(baseUrl, token) {
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Gateway model list failed (${response.status}): ${body}`);
  }
  const json = await response.json();
  return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
}

/**
 * Token-refreshing fetch interceptor. Always re-stamps Authorization with a
 * fresh gateway token so a request issued near expiry doesn't get rejected.
 */
async function gatewayFetch(requestInput, init) {
  const { token } = await ensureGatewayToken();

  // Per the Fetch spec, init.headers override but must not discard a Request's own
  // headers (e.g. content-type). Start from the Request's headers when one was
  // passed, layer init.headers on top, then stamp the fresh gateway token.
  const headers = new Headers(requestInput instanceof Request ? requestInput.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  headers.set("authorization", `Bearer ${token}`);

  return fetch(requestInput, { ...init, headers });
}

export const GatewayPlugin = async () => {
  const baseUrl = process.env.GATEWAY_BASE_URL;
  const initialToken = process.env.GATEWAY_TOKEN;

  // No gateway configured: register nothing (plugin is only copied in when
  // GATEWAY_TOKEN is set, but stay defensive).
  if (!baseUrl || !initialToken) {
    return {};
  }

  // Seed the in-memory cache from the env-provided token so the 5-min buffer is
  // accurate from the first request.
  cachedToken = initialToken;
  cachedBaseUrl = baseUrl;
  cachedExpiresAtMs = decodeJwtExpMs(initialToken);

  // Build the model map up-front from the live catalog. Keys are the
  // provider-qualified ids so body.model == "provider/model".
  const models = {};
  try {
    const catalog = await fetchCatalog(baseUrl, initialToken);
    for (const entry of catalog) {
      const id = typeof entry === "string" ? entry : entry?.id;
      if (!id) continue;
      const model = {
        name: (entry && entry.name) || id,
        // Subscription/proxied billing: costs are accounted gateway-side.
        cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      };
      // Carry context/output limits through if the catalog reports them, so
      // OpenCode manages the context window correctly.
      const context = entry?.limit?.context ?? entry?.context_length;
      const output = entry?.limit?.output ?? entry?.max_output_tokens;
      if (typeof context === "number" && typeof output === "number") {
        model.limit = { context, output };
      }
      models[id] = model;
    }
  } catch (err) {
    // Non-fatal: register the provider with an empty catalog so OpenCode can
    // still surface the gateway; selection of an unknown model will error
    // loudly rather than silently bypassing the gateway.
    console.error(`[gateway-plugin] catalog fetch failed: ${err?.message || err}`);
  }

  return {
    // See UNVERIFIED note at top of file: this mutates the merged config to
    // register the single openai-compatible gateway provider.
    config: async (config) => {
      config.provider ??= {};
      config.provider[GATEWAY_PROVIDER_ID] = {
        npm: GATEWAY_PROVIDER_NPM,
        name: GATEWAY_PROVIDER_NAME,
        options: {
          baseURL: `${baseUrl}/v1`,
          // openai-compatible providers require an apiKey; the real auth is
          // injected per-request by the fetch interceptor below, which always
          // overrides Authorization with a fresh gateway token.
          apiKey: initialToken,
          // Token-refreshing transport (UNVERIFIED: smoke-test that the
          // provider honors options.fetch; otherwise move to an auth loader).
          fetch: gatewayFetch,
        },
        models,
      };
    },
  };
};
