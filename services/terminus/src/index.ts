/**
 * Terminus — stateless LLM gateway (CON-41).
 *
 * Fronts all LLM traffic for sandboxes: verifies a short-lived signed token,
 * resolves the upstream provider credential server-side (from its own encrypted
 * D1 vault), serves a dynamic model catalog from the models.dev registry plus the
 * synthetic Codex provider, and proxies chat completions through the Vercel AI SDK.
 * Sandboxes hold only a scoped token, never raw provider keys.
 */
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";

import type { BroadcastDispatcher } from "./broadcast/dispatcher";
import { buildBroadcastDispatcher } from "./broadcast/registry";
import type { DestinationStore } from "./broadcast/store";
import { buildModelsList } from "./catalog/catalog";
import { withCodexProvider } from "./catalog/codex";
import { fetchRegistry } from "./catalog/models-dev";
import { CodexTokenManager } from "./credentials/codex-manager";
import { type CredentialProvider, VaultCredentialProvider } from "./credentials/provider";
import { CredentialVault, PLATFORM_OWNER } from "./db/vault";
import type { Env } from "./env";
import { errorResponse, toGatewayError } from "./errors";
import { gatewayAuth, type TerminusVars } from "./middleware/auth";
import { PolicyStore } from "./policy/store";
import { buildAdminApp } from "./routes/admin";
import { type ChatDeps, chatCompletions } from "./routes/chat";
import { NoopTraceSink, parseTraceCaptureEnabled, type TraceSink } from "./trace/sink";
import { LoggingUsageSink } from "./usage/sink";

export interface AppDeps {
  /** Injectable for tests; defaults to the live models.dev fetcher. */
  loadRegistry?: typeof fetchRegistry;
  /** Injectable usage sink; defaults to the logging no-op. */
  usageSink?: ChatDeps["usageSink"];
  /**
   * Injectable trace content-capture sink (CON-61); defaults to `NoopTraceSink`.
   * Only routed into the chat handler when `TERMINUS_TRACE_CAPTURE_ENABLED` is on.
   */
  traceSink?: TraceSink;
  /** Per-request credential provider factory; defaults to the D1 vault. */
  buildCredentials?: (env: Env) => CredentialProvider;
  /** Injectable vault factory for the admin API (tests); defaults to the D1 vault. */
  buildVault?: (env: Env) => CredentialVault;
  /** Per-request guardrail policy store factory (CON-71 L2); defaults to the D1 store. */
  buildPolicyStore?: (env: Env) => PolicyStore;
  /** Injectable destination store factory for the admin API (tests); defaults to the D1 store. */
  buildDestinationStore?: (env: Env) => DestinationStore;
  /**
   * Injectable broadcast dispatcher (CON-73); defaults to a D1-backed registry when a
   * DB is bound, else undefined (no fan-out). Tests inject a capturing dispatcher.
   */
  broadcast?: BroadcastDispatcher;
  /** Test-only chat overrides (model builder, clock, id + trace-id sources). */
  chat?: Pick<ChatDeps, "buildModel" | "now" | "newId" | "newTraceId">;
}

/** Default credential provider — the encrypted D1 vault + Codex token manager. */
function vaultCredentials(env: Env): CredentialProvider {
  const vault = new CredentialVault(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
  return new VaultCredentialProvider({ vault, codex: new CodexTokenManager(vault), env });
}

export function createApp(deps: AppDeps = {}) {
  const loadRegistry = deps.loadRegistry ?? fetchRegistry;
  const usageSink = deps.usageSink ?? new LoggingUsageSink();
  // Trace sink is constructed once (the default no-op is free); it is routed into the
  // chat handler per-request ONLY when the operator flag is on — see the handler below.
  const traceSink = deps.traceSink ?? new NoopTraceSink();
  const buildCredentials = deps.buildCredentials ?? vaultCredentials;
  // Guardrail policy store (CON-71 L2): the injected factory in tests, else the real D1 store
  // when a DB is bound. No DB (DB-less unit envs) → undefined → chat treats it as no policy.
  const policyStoreFor = (env: Env): PolicyStore | undefined => {
    if (deps.buildPolicyStore) return deps.buildPolicyStore(env);
    return env.DB ? new PolicyStore(drizzle(env.DB), env) : undefined;
  };
  // Broadcast fan-out (CON-73): the injected dispatcher in tests, else the D1-backed
  // registry when a DB is bound. No DB → undefined → chat does no fan-out.
  const broadcastFor = (env: Env): BroadcastDispatcher | undefined => {
    if (deps.broadcast) return deps.broadcast;
    return env.DB ? buildBroadcastDispatcher(env) : undefined;
  };
  const app = new Hono<{ Bindings: Env; Variables: TerminusVars }>();

  app.get("/health", (c) => c.json({ status: "healthy", service: "terminus" }));

  // Everything under /v1 requires a valid gateway token (CON-52).
  app.use("/v1/*", gatewayAuth);

  // CON-49 — dynamic catalog scoped to enabled providers (incl. Codex) + allowed models.
  app.get("/v1/models", async (c) => {
    try {
      const registry = withCodexProvider(await loadRegistry(c.env));
      const policy = (await policyStoreFor(c.env)?.getActivePolicy(PLATFORM_OWNER)) ?? null;
      const list = await buildModelsList(
        registry,
        buildCredentials(c.env),
        c.get("claims").allowed_models,
        policy
      );
      return c.json(list);
    } catch (err) {
      return errorResponse(toGatewayError(err));
    }
  });

  // CON-48 — chat completions proxy via the Vercel AI SDK.
  app.post("/v1/chat/completions", (c) =>
    chatCompletions(c, {
      loadRegistry,
      usageSink,
      // Gate trace capture at the edge (CON-61): pass the sink ONLY when the flag is on,
      // mirroring the env-derived `credentials`/`policy` wiring. Off → undefined → chat
      // does no content handling.
      traceSink: parseTraceCaptureEnabled(c.env.TERMINUS_TRACE_CAPTURE_ENABLED)
        ? traceSink
        : undefined,
      credentials: buildCredentials(c.env),
      policy: policyStoreFor(c.env),
      broadcast: broadcastFor(c.env),
      ...deps.chat,
    })
  );

  // CON-70 + CON-71 — platform credential + policy admin API (own bearer auth, not /v1).
  app.route(
    "/admin",
    buildAdminApp({
      buildVault: deps.buildVault,
      buildPolicyStore: deps.buildPolicyStore,
      buildDestinationStore: deps.buildDestinationStore,
    })
  );

  return app;
}

const app = createApp();

/**
 * Worker entrypoint. The cron `scheduled` handler keeps the Codex access token
 * fresh proactively (CON-50), so request paths almost always read a live token.
 */
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const vault = new CredentialVault(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
    await new CodexTokenManager(vault).refreshIfNearExpiry();
  },
};
