/**
 * Platform credential ingestion / admin API (CON-70).
 *
 * Authenticated CRUD over the credential vault for the **platform** owner — the
 * runtime path for seeding/rotating provider keys (replacing the Terraform-secret-
 * only seed). Auth is a dedicated `TERMINUS_ADMIN_SECRET` bearer (constant-time
 * compare, fail-closed), distinct from the sandbox gateway token. Per-tenant
 * ingestion arrives with multi-tenancy; v1 manages platform credentials only.
 * Secrets are never returned (only `PublicCredentialRow` metadata).
 *
 * The mint-token route (CON-77) lets a **standalone** Terminus deploy (no control
 * plane to broker per-sandbox tokens) issue gateway tokens via API, gated by the
 * same admin bearer. The minted token is never logged.
 */
import { DEFAULT_GATEWAY_TOKEN_TTL_SECONDS, mintGatewayToken } from "@open-inspect/shared";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";

import { DEFAULT_DATADOG_SITE } from "../broadcast/adapters/datadog";
import { buildDestination } from "../broadcast/registry";
import { checkDestinationUrl } from "../broadcast/ssrf";
import { DestinationStore } from "../broadcast/store";
import { CODEX_PROVIDER, CredentialVault } from "../db/vault";
import type { Env } from "../env";
import { PLATFORM_DEFAULT_POLICY_NAME, PolicyStore } from "../policy/store";

export interface AdminDeps {
  /** Injectable vault factory (tests); defaults to the D1-backed vault. */
  buildVault?: (env: Env) => CredentialVault;
  /** Injectable policy store factory (tests); defaults to the D1-backed store. */
  buildPolicyStore?: (env: Env) => PolicyStore;
  /** Injectable destination store factory (tests); defaults to the D1-backed store. */
  buildDestinationStore?: (env: Env) => DestinationStore;
}

function defaultVault(env: Env): CredentialVault {
  return new CredentialVault(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
}

function defaultPolicyStore(env: Env): PolicyStore {
  return new PolicyStore(drizzle(env.DB), env);
}

function defaultDestinationStore(env: Env): DestinationStore {
  return new DestinationStore(drizzle(env.DB), env.CREDENTIALS_ENCRYPTION_KEY);
}

/**
 * Per-type create/PATCH validation spec for broadcast destinations (CON-73). Table-driven
 * so the POST and PATCH paths share ONE validator (no per-type if/else drift across the two)
 * and Phase-2 types slot in by adding a row. The UNIVERSAL guards — plaintext-`headers`
 * rejection, `configHasSecret`, samplingRate range — are applied to every type OUTSIDE this
 * table; this table only carries the per-type URL (SSRF target) + required field lists.
 */
interface DestinationSpec {
  /** Config field carrying a URL to SSRF-check. `required`: the field must be present+valid. */
  urlConfigField?: { field: string; required: boolean };
  /** Derive a URL to SSRF-check from config (for types whose endpoint is computed, e.g. Datadog). */
  derivedUrl?: (config: Record<string, unknown>) => string;
  /** Non-secret config fields that must be present non-empty strings (e.g. Datadog `mlApp`). */
  requiredConfigFields?: string[];
  /** Secret fields that must be present non-empty strings (e.g. PostHog `projectApiKey`). */
  requiredSecretFields?: string[];
}

/** Broadcast destination types the admin API accepts + their validation spec (CON-73). */
const DESTINATION_SPECS: Record<string, DestinationSpec> = {
  otlp: { urlConfigField: { field: "endpoint", required: true } },
  posthog: {
    urlConfigField: { field: "host", required: false },
    requiredSecretFields: ["projectApiKey"],
  },
  webhook: { urlConfigField: { field: "url", required: true } },
  s3: {
    urlConfigField: { field: "endpoint", required: true },
    requiredConfigFields: ["bucket", "region"],
    requiredSecretFields: ["accessKeyId", "secretAccessKey"],
  },
  langsmith: {
    urlConfigField: { field: "endpoint", required: false },
    requiredSecretFields: ["apiKey"],
  },
  langfuse: {
    urlConfigField: { field: "host", required: false },
    requiredSecretFields: ["publicKey", "secretKey"],
  },
  datadog: {
    // `|| DEFAULT` (not `??`) so a present-but-empty `site` falls back to the default rather
    // than deriving the inert `https://api./…` — kept identical to DatadogDestination's ctor.
    derivedUrl: (config) =>
      `https://api.${str(config.site) || DEFAULT_DATADOG_SITE}/api/intake/llm-obs/v1/trace/spans`,
    requiredConfigFields: ["mlApp"],
    requiredSecretFields: ["apiKey"],
  },
};
const KNOWN_DESTINATION_TYPES = new Set(Object.keys(DESTINATION_SPECS));

/**
 * Per-type config/secret validation, shared by create and PATCH (the latter passes the
 * MERGED-over-existing config/secret). Returns a 400 message on the first failure: an
 * unsafe/missing URL (SSRF guard), or a missing required config/secret field — which would
 * otherwise persist a row the registry silently skips as misconfigured (an inert fan-out drop).
 */
function validateDestinationFields(
  type: string,
  config: Record<string, unknown>,
  secret: Record<string, unknown>
): { ok: true } | { ok: false; message: string } {
  const spec = DESTINATION_SPECS[type];
  if (!spec) return { ok: true }; // unknown type is rejected by the caller's KNOWN check
  if (spec.urlConfigField) {
    const { field, required } = spec.urlConfigField;
    if (config[field] !== undefined) {
      const check = checkDestinationUrl(str(config[field]) ?? "");
      if (!check.ok) return { ok: false, message: `invalid ${type} ${field}: ${check.reason}` };
    } else if (required) {
      return { ok: false, message: `invalid ${type} ${field}: ${field} is required` };
    }
  }
  if (spec.derivedUrl) {
    const check = checkDestinationUrl(spec.derivedUrl(config));
    if (!check.ok) return { ok: false, message: `invalid ${type} site: ${check.reason}` };
  }
  for (const field of spec.requiredConfigFields ?? []) {
    if (!str(config[field])) {
      return { ok: false, message: `${type} destinations require config.${field} (string)` };
    }
  }
  for (const field of spec.requiredSecretFields ?? []) {
    if (!str(secret[field])) {
      return { ok: false, message: `${type} destinations require secret.${field} (string)` };
    }
  }
  return { ok: true };
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
  // Fold the length difference into `diff` and iterate to the longer of the two, rather
  // than branching on a length mismatch — an early `return false` would reject a
  // wrong-length token in O(1) while a right-length one runs the full loop, leaking the
  // secret's byte length through response timing.
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < ab.length || i < bb.length; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
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
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((m) => typeof m === "string");

/**
 * Key names that look like a credential — rejected ANYWHERE in plaintext `config`
 * (CON-73). Auth material belongs in the encrypted `secret`; `config` is non-secret.
 * (Headers are rejected wholesale from `config` separately, since a vendor's bespoke
 * auth header — e.g. `x-honeycomb-team` — needn't match this pattern.)
 */
const SECRET_KEY_RE =
  /(authorization|cookie|password|secret|token|hmac|api[-_]?key|projectapikey|[-_](key|secret|token))/i;
/** Recursively scan a config value for a secret-looking key. */
function configHasSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(configHasSecret);
  if (isRecord(value)) {
    return Object.entries(value).some(([k, v]) => SECRET_KEY_RE.test(k) || configHasSecret(v));
  }
  return false;
}

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
  const buildDestinationStore = deps.buildDestinationStore ?? defaultDestinationStore;
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

  // CON-77 — mint a gateway token for a standalone deploy (no control plane to
  // broker per-sandbox tokens). Same admin bearer as the rest of /admin. The
  // minted token is never logged.
  app.post("/mint-token", async (c) => {
    const secret = c.env.TERMINUS_JWT_SECRET;
    if (!secret) {
      return c.json(
        { error: { message: "gateway token secret not configured", type: "internal_error" } },
        500
      );
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const sid = str(body?.sid);
    // `str("")` returns "" (a string), so this also rejects an empty sid — the
    // message covers both the missing and empty cases accurately.
    if (!body || !sid) {
      return c.json(
        { error: { message: "sid must be a non-empty string", type: "bad_request" } },
        400
      );
    }
    // Reject present-but-mistyped optional fields instead of silently dropping them.
    if (body.tenant !== undefined && body.tenant !== null && typeof body.tenant !== "string") {
      return c.json(
        { error: { message: "tenant must be a string or null when present", type: "bad_request" } },
        400
      );
    }
    if (body.allowed_models !== undefined && !isStringArray(body.allowed_models)) {
      return c.json(
        { error: { message: "allowed_models must be a string array", type: "bad_request" } },
        400
      );
    }
    // isSafeInteger (not isInteger): reject numbers past 2^53 that would round to
    // an imprecise `exp`. No upper TTL cap — that's a product decision, deferred.
    if (
      body.ttlSeconds !== undefined &&
      (typeof body.ttlSeconds !== "number" ||
        !Number.isSafeInteger(body.ttlSeconds) ||
        body.ttlSeconds <= 0)
    ) {
      return c.json(
        { error: { message: "ttlSeconds must be a positive integer", type: "bad_request" } },
        400
      );
    }

    const ttlSeconds = num(body.ttlSeconds) ?? DEFAULT_GATEWAY_TOKEN_TTL_SECONDS;
    // Pin `now` so the response's expiresAt is exactly the token's `exp` claim —
    // epoch seconds (RFC 7519 NumericDate), matching the minter — with no clock drift.
    const iat = Math.floor(Date.now() / 1000);
    const expiresAt = iat + ttlSeconds;
    try {
      const token = await mintGatewayToken(
        {
          sid,
          // null = single-tenant rollout (mirrors the claims default).
          tenant: (body.tenant as string | null | undefined) ?? null,
          // [] = unrestricted (matches the current rollout).
          allowed_models: isStringArray(body.allowed_models) ? body.allowed_models : [],
        },
        secret,
        { ttlSeconds, now: iat }
      );
      return c.json({ token, expiresAt });
    } catch {
      // A WebCrypto failure (importKey/sign) shouldn't leak Hono's default error
      // shape — return the same envelope as the rest of /admin.
      return c.json(
        { error: { message: "failed to mint gateway token", type: "internal_error" } },
        500
      );
    }
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

  // CON-73 — configurable broadcast destinations (platform owner). Mirrors credential
  // CRUD. Auth material lives in the encrypted `secret` blob; `config` is non-secret
  // (the create path rejects secret-looking headers in `config`). Secrets never leave.
  app.post("/destinations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const type = str(body?.type);
    if (!body || !type || !isRecord(body.config) || !isRecord(body.secret)) {
      return c.json(
        {
          error: {
            message: "type (string), config (object), and secret (object) are required",
            type: "bad_request",
          },
        },
        400
      );
    }
    if (!KNOWN_DESTINATION_TYPES.has(type)) {
      return c.json(
        { error: { message: `unsupported destination type: ${type}`, type: "bad_request" } },
        400
      );
    }
    if (
      body.samplingRate !== undefined &&
      (typeof body.samplingRate !== "number" || body.samplingRate < 0 || body.samplingRate > 1)
    ) {
      return c.json(
        { error: { message: "samplingRate must be a number in [0,1]", type: "bad_request" } },
        400
      );
    }
    if (
      (body.label !== undefined && typeof body.label !== "string") ||
      (body.enabled !== undefined && typeof body.enabled !== "boolean")
    ) {
      return c.json(
        {
          error: {
            message: "label and enabled must have the correct type when present",
            type: "bad_request",
          },
        },
        400
      );
    }
    // Headers carry auth → they belong in the encrypted `secret.headers`, never `config`.
    if ("headers" in body.config) {
      return c.json(
        {
          error: {
            message: "headers must be set in `secret.headers`, not plaintext `config`",
            type: "bad_request",
          },
        },
        400
      );
    }
    // No secret-looking field may sit in plaintext `config` (it would also leak via list).
    if (configHasSecret(body.config)) {
      return c.json(
        {
          error: {
            message: "secret-looking fields must be set in `secret`, not plaintext `config`",
            type: "bad_request",
          },
        },
        400
      );
    }
    // Per-type validation: SSRF-check every runtime-configured URL (an SSRF vector) and
    // require the fields the registry needs, so a persisted row is never silently inert.
    const valid = validateDestinationFields(
      type,
      body.config as Record<string, unknown>,
      body.secret as Record<string, unknown>
    );
    if (!valid.ok) {
      return c.json({ error: { message: valid.message, type: "bad_request" } }, 400);
    }
    try {
      const { id } = await buildDestinationStore(c.env).create({
        type,
        config: body.config,
        secret: body.secret,
        label: str(body.label),
        samplingRate: num(body.samplingRate),
        enabled: bool(body.enabled),
      });
      return c.json({ id }, 201);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json(
          {
            error: {
              message: "a destination already exists for that type+label",
              type: "conflict",
            },
          },
          409
        );
      }
      return c.json(
        { error: { message: "failed to create destination", type: "internal_error" } },
        500
      );
    }
  });

  app.get("/destinations", async (c) => {
    return c.json({ destinations: await buildDestinationStore(c.env).listForOwner() });
  });

  // Patch any subset of {enabled, samplingRate, config, secret} — including re-credentialling
  // (rotate the `secret`) and re-pointing (`config.url`/`endpoint`/`host`), without a new id.
  app.patch("/destinations/:id", async (c) => {
    const id = c.req.param("id");
    const store = buildDestinationStore(c.env);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return c.json({ error: { message: "request body is required", type: "bad_request" } }, 400);
    }
    const fields: { config?: unknown; secret?: unknown; samplingRate?: number; enabled?: boolean } =
      {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return c.json(
          { error: { message: "enabled must be a boolean", type: "bad_request" } },
          400
        );
      }
      fields.enabled = body.enabled;
    }
    if (body.samplingRate !== undefined) {
      if (typeof body.samplingRate !== "number" || body.samplingRate < 0 || body.samplingRate > 1) {
        return c.json(
          { error: { message: "samplingRate must be a number in [0,1]", type: "bad_request" } },
          400
        );
      }
      fields.samplingRate = body.samplingRate;
    }
    if (body.config !== undefined) {
      if (!isRecord(body.config)) {
        return c.json({ error: { message: "config must be an object", type: "bad_request" } }, 400);
      }
      if ("headers" in body.config) {
        return c.json(
          {
            error: {
              message: "headers must be set in `secret.headers`, not plaintext `config`",
              type: "bad_request",
            },
          },
          400
        );
      }
      if (configHasSecret(body.config)) {
        return c.json(
          {
            error: {
              message: "secret-looking fields must be set in `secret`, not plaintext `config`",
              type: "bad_request",
            },
          },
          400
        );
      }
    }
    if (body.secret !== undefined && !isRecord(body.secret)) {
      return c.json({ error: { message: "secret must be an object", type: "bad_request" } }, 400);
    }

    // Preflight: when config/secret change, MERGE over the existing row and re-validate the
    // result against the row's type, so a partial PATCH can't drop a required field (e.g. an
    // OTLP `endpoint`) or rotate a PostHog key to empty — which would persist but never build
    // (a silent fan-out drop). Merging also means a PATCH only changes the keys it names.
    if (body.config !== undefined || body.secret !== undefined) {
      const existing = await store.getDecrypted(id);
      if (!existing) {
        return c.json({ error: { message: "not found", type: "not_found" } }, 404);
      }
      const existingConfig = isRecord(existing.config) ? existing.config : {};
      const existingSecret = isRecord(existing.secret) ? existing.secret : {};
      const mergedConfig =
        body.config !== undefined
          ? { ...existingConfig, ...(body.config as Record<string, unknown>) }
          : existingConfig;
      const mergedSecret =
        body.secret !== undefined
          ? { ...existingSecret, ...(body.secret as Record<string, unknown>) }
          : existingSecret;

      // Re-validate the MERGED result against the row's type (same validator as create), so a
      // partial PATCH can neither drop a required field nor SSRF past the URL guard.
      const valid = validateDestinationFields(existing.type, mergedConfig, mergedSecret);
      if (!valid.ok) {
        return c.json({ error: { message: valid.message, type: "bad_request" } }, 400);
      }

      if (body.config !== undefined) fields.config = mergedConfig;
      if (body.secret !== undefined) fields.secret = mergedSecret;
    }

    if (Object.keys(fields).length === 0) {
      return c.json(
        {
          error: {
            message: "at least one of enabled, samplingRate, config, secret is required",
            type: "bad_request",
          },
        },
        400
      );
    }
    const ok = await store.update(id, fields);
    return ok
      ? c.body(null, 204)
      : c.json({ error: { message: "not found", type: "not_found" } }, 404);
  });

  app.delete("/destinations/:id", async (c) => {
    const ok = await buildDestinationStore(c.env).delete(c.req.param("id"));
    return ok
      ? c.body(null, 204)
      : c.json({ error: { message: "not found", type: "not_found" } }, 404);
  });

  // Validate a destination before relying on it: decrypt, build the adapter, probe.
  // `testConnection` is best-effort and never throws (a real send is what proves it).
  app.post("/destinations/:id/test", async (c) => {
    const row = await buildDestinationStore(c.env).getDecrypted(c.req.param("id"));
    if (!row) {
      return c.json({ error: { message: "not found", type: "not_found" } }, 404);
    }
    const destination = buildDestination(row);
    if (!destination) {
      return c.json(
        { error: { message: "destination unsupported or misconfigured", type: "bad_request" } },
        400
      );
    }
    return c.json(await destination.testConnection());
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
    try {
      const { id } = await buildPolicyStore(c.env).createPolicy({ name });
      return c.json({ id }, 201);
    } catch (err) {
      // Only a unique-constraint violation is a real conflict; any other failure
      // (DB error, …) is a 500, not a misleading 409.
      if (isUniqueViolation(err)) {
        return c.json(
          {
            error: {
              message: "a policy already exists with that name",
              type: "conflict",
            },
          },
          409
        );
      }
      return c.json({ error: { message: "failed to create policy", type: "internal_error" } }, 500);
    }
  });

  app.get("/policies", async (c) => {
    return c.json({ policies: await buildPolicyStore(c.env).listPolicies() });
  });

  app.post("/policies/:id/versions", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.config === undefined) {
      return c.json({ error: { message: "config is required", type: "bad_request" } }, 400);
    }
    if (body.activate !== undefined && typeof body.activate !== "boolean") {
      return c.json(
        { error: { message: "activate must be a boolean when present", type: "bad_request" } },
        400
      );
    }
    try {
      const result = await buildPolicyStore(c.env).createVersion(
        c.req.param("id"),
        body.config,
        bool(body.activate) ?? false
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
