/**
 * Terminus — stateless LLM gateway (CON-41).
 *
 * Fronts all LLM traffic for sandboxes: verifies a short-lived signed token,
 * resolves the upstream provider credential server-side, serves a dynamic model
 * catalog from the models.dev registry, and (CON-48) proxies chat completions
 * through the Vercel AI SDK. Sandboxes hold only a scoped token, never raw
 * provider keys.
 */
import { Hono } from "hono";

import { buildModelsList } from "./catalog/catalog";
import { fetchRegistry } from "./catalog/models-dev";
import { EnvKeyResolver } from "./credentials/resolver";
import type { Env } from "./env";
import { GatewayError, errorResponse, toGatewayError } from "./errors";
import { gatewayAuth, type TerminusVars } from "./middleware/auth";

export interface AppDeps {
  /** Injectable for tests; defaults to the live models.dev fetcher. */
  loadRegistry?: typeof fetchRegistry;
}

export function createApp(deps: AppDeps = {}) {
  const loadRegistry = deps.loadRegistry ?? fetchRegistry;
  const app = new Hono<{ Bindings: Env; Variables: TerminusVars }>();

  app.get("/health", (c) => c.json({ status: "healthy", service: "terminus" }));

  // Everything under /v1 requires a valid gateway token (CON-52).
  app.use("/v1/*", gatewayAuth);

  // CON-49 — dynamic catalog scoped to enabled providers + the session's allowed models.
  app.get("/v1/models", async (c) => {
    try {
      const registry = await loadRegistry(c.env);
      const resolver = new EnvKeyResolver(c.env);
      const list = await buildModelsList(registry, resolver, c.get("claims").allowed_models);
      return c.json(list);
    } catch (err) {
      return errorResponse(toGatewayError(err));
    }
  });

  // CON-48 — chat completions proxy. Implemented next; stubbed so the catalog +
  // auth surface ships and deploys independently.
  app.post("/v1/chat/completions", () =>
    errorResponse(
      new GatewayError(
        "upstream_error",
        501,
        "api_error",
        "chat completions proxy not yet implemented"
      )
    )
  );

  return app;
}

export default createApp();
