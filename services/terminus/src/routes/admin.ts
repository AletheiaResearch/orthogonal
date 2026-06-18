/**
 * Platform credential ingestion / admin API (CON-70).
 *
 * Authenticated CRUD over the credential vault for the **platform** owner — the
 * runtime path for seeding/rotating provider keys (replacing the Terraform-secret-
 * only seed). Auth is a dedicated `TERMINUS_ADMIN_SECRET` bearer (constant-time
 * compare, fail-closed), distinct from the sandbox gateway token. Per-tenant
 * ingestion arrives with multi-tenancy; v1 manages platform credentials only.
 * Secrets are never returned (only `PublicCredentialRow` metadata).
 */
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";

import { CODEX_PROVIDER, CredentialVault } from "../db/vault";
import type { Env } from "../env";
import { PLATFORM_DEFAULT_POLICY_NAME, PolicyStore } from "../policy/store";

export interface AdminDeps {
  /** Injectable vault factory (tests); defaults to the D1-backed vault. */
  buildVault?: (env: Env) => CredentialVault;
  /** Injectable policy store factory (tests); defaults to the D1-backed store. */
  buildPolicyStore?: (env: Env) => PolicyStore;
}

function defaultVault(env: Env): CredentialVault {
  return new CredentialVault(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
}

function defaultPolicyStore(env: Env): PolicyStore {
  return new PolicyStore(drizzle(env.DB), env);
}

/** A policy blob that fails validation (vs any other failure) — for a 400 vs 500 split. */
function isPolicyValidationError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("invalid policy blob");
}

/** Constant-time string compare (avoids leaking the secret via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function bearer(authorization: string | undefined): string {
  const value = authorization ?? "";
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : "";
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Walk the message + `cause` chain — Drizzle wraps the D1 error, so the SQLite text is in `cause`. */
function errorChainText(err: unknown): string {
  if (err instanceof Error) return `${err.message} ${errorChainText(err.cause)}`;
  return err == null ? "" : String(err);
}

/** A unique-constraint violation (a real conflict) vs any other failure. */
function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(errorChainText(err));
}

export function buildAdminApp(deps: AdminDeps = {}) {
  const buildVault = deps.buildVault ?? defaultVault;
  const buildPolicyStore = deps.buildPolicyStore ?? defaultPolicyStore;
  const app = new Hono<{ Bindings: Env }>();

  // Bearer auth against TERMINUS_ADMIN_SECRET. Fail-closed when the secret is unset.
  app.use("*", async (c, next) => {
    const expected = c.env.TERMINUS_ADMIN_SECRET;
    const token = bearer(c.req.header("authorization"));
    if (!expected || !token || !timingSafeEqual(token, expected)) {
      return c.json({ error: { message: "unauthorized", type: "unauthorized" } }, 401);
    }
    await next();
  });

  app.post("/credentials", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const provider = str(body?.provider);
    const apiKey = str(body?.apiKey);
    if (!body || !provider || !apiKey) {
      return c.json(
        { error: { message: "provider and apiKey (strings) are required", type: "bad_request" } },
        400
      );
    }
    // Codex is OAuth-only; it cannot be ingested as a plain api_key credential.
    if (provider === CODEX_PROVIDER) {
      return c.json(
        {
          error: {
            message: "codex credentials cannot be created via the api-key ingestion path",
            type: "bad_request",
          },
        },
        400
      );
    }
    // Reject present-but-mistyped optional fields instead of silently applying defaults
    // (e.g. {"enabled":"false"} must not create an enabled key).
    if (
      (body.label !== undefined && typeof body.label !== "string") ||
      (body.priority !== undefined && typeof body.priority !== "number") ||
      (body.weight !== undefined && typeof body.weight !== "number") ||
      (body.enabled !== undefined && typeof body.enabled !== "boolean")
    ) {
      return c.json(
        {
          error: {
            message: "label, priority, weight, and enabled must have the correct type when present",
            type: "bad_request",
          },
        },
        400
      );
    }
    const vault = buildVault(c.env);
    try {
      const { id } = await vault.createCredential({
        provider,
        apiKey,
        label: str(body.label),
        priority: num(body.priority),
        weight: num(body.weight),
        enabled: bool(body.enabled),
      });
      return c.json({ id }, 201);
    } catch (err) {
      // Only a unique-constraint violation is a real conflict; any other failure
      // (DB error, encryption failure, …) is a 500, not a misleading 409.
      if (isUniqueViolation(err)) {
        return c.json(
          {
            error: {
              message: "a credential already exists for that provider+label",
              type: "conflict",
            },
          },
          409
        );
      }
      return c.json(
        { error: { message: "failed to create credential", type: "internal_error" } },
        500
      );
    }
  });

  app.get("/credentials", async (c) => {
    const vault = buildVault(c.env);
    return c.json({ credentials: await vault.listForOwner() });
  });

  app.patch("/credentials/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const enabled = bool(body?.enabled);
    if (enabled === undefined) {
      return c.json(
        { error: { message: "enabled (boolean) is required", type: "bad_request" } },
        400
      );
    }
    const vault = buildVault(c.env);
    const ok = await vault.setEnabled(c.req.param("id"), enabled);
    return ok
      ? c.body(null, 204)
      : c.json({ error: { message: "not found", type: "not_found" } }, 404);
  });

  app.delete("/credentials/:id", async (c) => {
    const vault = buildVault(c.env);
    const ok = await vault.deleteCredential(c.req.param("id"));
    return ok
      ? c.body(null, 204)
      : c.json({ error: { message: "not found", type: "not_found" } }, 404);
  });

  // CON-71 L2 — guardrail policy management (platform owner; versioned + rollback).
  app.post("/policies", async (c) => {
    const rawBody = await c.req.text();
    let body: Record<string, unknown> | null = null;
    if (rawBody.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawBody) as unknown;
        if (!isRecord(parsed)) {
          return c.json({ error: { message: "body must be an object", type: "bad_request" } }, 400);
        }
        body = parsed;
      } catch {
        return c.json(
          { error: { message: "request body is not valid JSON", type: "bad_request" } },
          400
        );
      }
    }
    const name = str(body?.name);
    if (body && body.name !== undefined && name === undefined) {
      return c.json({ error: { message: "name must be a string", type: "bad_request" } }, 400);
    }
    if (name !== undefined && name !== PLATFORM_DEFAULT_POLICY_NAME) {
      return c.json(
        {
          error: {
            message: "only the platform-default policy is supported in v1",
            type: "bad_request",
          },
        },
        400
      );
    }
    const { id } = await buildPolicyStore(c.env).createPolicy({ name });
    return c.json({ id }, 201);
  });

  app.get("/policies", async (c) => {
    return c.json({ policies: await buildPolicyStore(c.env).listPolicies() });
  });

  app.post("/policies/:id/versions", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.config === undefined) {
      return c.json({ error: { message: "config is required", type: "bad_request" } }, 400);
    }
    try {
      const result = await buildPolicyStore(c.env).createVersion(
        c.req.param("id"),
        body.config,
        body.activate === true
      );
      if (!result) {
        return c.json({ error: { message: "not found", type: "not_found" } }, 404);
      }
      return c.json(result, 201);
    } catch (err) {
      // An invalid blob is a 400; any other failure (DB, …) is a 500.
      if (isPolicyValidationError(err)) {
        return c.json({ error: { message: "invalid policy blob", type: "bad_request" } }, 400);
      }
      return c.json(
        { error: { message: "failed to create version", type: "internal_error" } },
        500
      );
    }
  });

  app.get("/policies/:id/versions", async (c) => {
    return c.json({ versions: await buildPolicyStore(c.env).listVersions(c.req.param("id")) });
  });

  app.patch("/policies/:id/versions/:version", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.isActive !== true) {
      return c.json({ error: { message: "isActive must be true", type: "bad_request" } }, 400);
    }
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version)) {
      return c.json({ error: { message: "version must be an integer", type: "bad_request" } }, 400);
    }
    const ok = await buildPolicyStore(c.env).setActiveVersion(c.req.param("id"), version);
    return ok
      ? c.body(null, 204)
      : c.json({ error: { message: "not found", type: "not_found" } }, 404);
  });

  return app;
}
