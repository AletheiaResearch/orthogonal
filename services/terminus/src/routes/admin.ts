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

import { CredentialVault } from "../db/vault";
import type { Env } from "../env";

export interface AdminDeps {
  /** Injectable vault factory (tests); defaults to the D1-backed vault. */
  buildVault?: (env: Env) => CredentialVault;
}

function defaultVault(env: Env): CredentialVault {
  return new CredentialVault(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
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

export function buildAdminApp(deps: AdminDeps = {}) {
  const buildVault = deps.buildVault ?? defaultVault;
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
    if (!provider || !apiKey) {
      return c.json(
        { error: { message: "provider and apiKey (strings) are required", type: "bad_request" } },
        400
      );
    }
    const vault = buildVault(c.env);
    try {
      const { id } = await vault.createCredential({
        provider,
        apiKey,
        label: str(body?.label),
        priority: num(body?.priority),
        weight: num(body?.weight),
        enabled: bool(body?.enabled),
      });
      return c.json({ id }, 201);
    } catch {
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

  return app;
}
