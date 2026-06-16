/**
 * Terminus — stateless LLM gateway (CON-41).
 *
 * Fronts all LLM traffic for sandboxes: verifies a short-lived signed token,
 * resolves the upstream provider credential server-side, serves a dynamic model
 * catalog from the models.dev registry, and proxies chat completions through the
 * Vercel AI SDK. Sandboxes hold only a scoped token, never raw provider keys.
 */
import { Hono } from "hono";

import { buildModelsList } from "./catalog/catalog";
import { fetchRegistry } from "./catalog/models-dev";
import { EnvKeyResolver } from "./credentials/resolver";
import type { Env } from "./env";
import { errorResponse, toGatewayError } from "./errors";
import { gatewayAuth, type TerminusVars } from "./middleware/auth";
import { type ChatDeps, chatCompletions } from "./routes/chat";
import { LoggingUsageSink } from "./usage/sink";

export interface AppDeps {
  /** Injectable for tests; defaults to the live models.dev fetcher. */
  loadRegistry?: typeof fetchRegistry;
  /** Injectable usage sink; defaults to the logging no-op. */
  usageSink?: ChatDeps["usageSink"];
  /** Test-only chat overrides (model builder, clock, id source). */
  chat?: Pick<ChatDeps, "buildModel" | "now" | "newId">;
}

export function createApp(deps: AppDeps = {}) {
  const loadRegistry = deps.loadRegistry ?? fetchRegistry;
  const usageSink = deps.usageSink ?? new LoggingUsageSink();
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

  // CON-48 — chat completions proxy via the Vercel AI SDK.
  app.post("/v1/chat/completions", (c) =>
    chatCompletions(c, { loadRegistry, usageSink, ...deps.chat })
  );

  return app;
}

export default createApp();
