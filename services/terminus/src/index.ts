/**
 * Terminus — stateless LLM gateway (CON-41).
 *
 * Fronts all LLM traffic for sandboxes: verifies a short-lived signed token,
 * resolves the upstream provider credential server-side, serves a dynamic model
 * catalog from the models.dev registry, and proxies chat completions through the
 * Vercel AI SDK. Sandboxes hold only a scoped token, never raw provider keys.
 */
import { Hono } from "hono";

import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "healthy", service: "terminus" }));

// `/v1/*` routes (auth middleware, `/v1/models`, `/v1/chat/completions`) are
// mounted here as the spine is built out (CON-48 / CON-49 / CON-52).

export default app;
