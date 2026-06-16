/**
 * Gateway token (CON-52) — a short-lived, stateless HS256 JWT the control plane
 * mints for a sandbox and the Terminus LLM gateway verifies on every request.
 *
 * Claims model the multi-tenant future without changing shape later: `tenant` is
 * carried now (nullable during single-tenant rollout) and `allowed_models` scopes
 * which catalog entries the session may use.
 *
 * Note on units: `iat`/`exp` are RFC 7519 NumericDate values — **seconds** since
 * the epoch (the JWT standard), which overrides this repo's millisecond default
 * for TypeScript durations. The TTL constant carries its unit in the name.
 */
import { timingSafeEqual } from "./auth";

/** Default token lifetime: 15 minutes. */
export const DEFAULT_GATEWAY_TOKEN_TTL_SECONDS = 900;

export interface GatewayTokenClaims {
  /** Session id (always observable gateway-side; the usage attribution key). */
  sid: string;
  /** Tenant id; null during single-tenant rollout. */
  tenant: string | null;
  /** Provider-qualified model ids this session may use (e.g. "anthropic/claude-opus-4-8"). */
  allowed_models: string[];
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expiry, epoch seconds. */
  exp: number;
}

export interface MintGatewayTokenInput {
  sid: string;
  tenant?: string | null;
  allowed_models: string[];
}

export type GatewayTokenInvalidReason = "malformed" | "bad-signature" | "expired" | "not-yet-valid";

export type GatewayTokenVerifyResult =
  | { valid: true; claims: GatewayTokenClaims }
  | { valid: false; reason: GatewayTokenInvalidReason };

interface MintOptions {
  /** Token lifetime in seconds (defaults to {@link DEFAULT_GATEWAY_TOKEN_TTL_SECONDS}). */
  ttlSeconds?: number;
  /** Override "now" (epoch seconds) — for deterministic tests. */
  now?: number;
}

interface VerifyOptions {
  /** Override "now" (epoch seconds) — for deterministic tests. */
  now?: number;
}

const HEADER = { alg: "HS256", typ: "JWT" } as const;

/** Mint a signed gateway token. */
export async function mintGatewayToken(
  input: MintGatewayTokenInput,
  secret: string,
  options: MintOptions = {}
): Promise<string> {
  const iat = options.now ?? nowSeconds();
  const exp = iat + (options.ttlSeconds ?? DEFAULT_GATEWAY_TOKEN_TTL_SECONDS);
  const claims: GatewayTokenClaims = {
    sid: input.sid,
    tenant: input.tenant ?? null,
    allowed_models: input.allowed_models,
    iat,
    exp,
  };

  const signingInput = `${encodeJson(HEADER)}.${encodeJson(claims)}`;
  const signature = await hmacSignBase64Url(signingInput, secret);
  return `${signingInput}.${signature}`;
}

/** Verify a gateway token (stateless: signature + expiry only). */
export async function verifyGatewayToken(
  token: string,
  secret: string,
  options: VerifyOptions = {}
): Promise<GatewayTokenVerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return { valid: false, reason: "malformed" };
  }

  const header = decodeJson(headerB64);
  if (!header || header.alg !== "HS256") {
    return { valid: false, reason: "bad-signature" };
  }

  const expected = await hmacSignBase64Url(`${headerB64}.${payloadB64}`, secret);
  if (!timingSafeEqual(signatureB64, expected)) {
    return { valid: false, reason: "bad-signature" };
  }

  const payload = decodeJson(payloadB64);
  if (!isClaims(payload)) return { valid: false, reason: "malformed" };

  const now = options.now ?? nowSeconds();
  if (typeof payload.nbf === "number" && now < payload.nbf) {
    return { valid: false, reason: "not-yet-valid" };
  }
  if (now >= payload.exp) return { valid: false, reason: "expired" };

  return {
    valid: true,
    claims: {
      sid: payload.sid,
      tenant: payload.tenant ?? null,
      allowed_models: payload.allowed_models,
      iat: payload.iat,
      exp: payload.exp,
    },
  };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function isClaims(value: unknown): value is GatewayTokenClaims & { nbf?: number } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sid === "string" &&
    (v.tenant === null || v.tenant === undefined || typeof v.tenant === "string") &&
    Array.isArray(v.allowed_models) &&
    v.allowed_models.every((m) => typeof m === "string") &&
    typeof v.iat === "number" &&
    typeof v.exp === "number"
  );
}

async function hmacSignBase64Url(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const json = new TextDecoder().decode(base64UrlDecode(segment));
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(segment: string): Uint8Array {
  const padded =
    segment.length % 4 === 0 ? segment : segment + "=".repeat(4 - (segment.length % 4));
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
