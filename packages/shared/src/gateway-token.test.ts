import { describe, expect, it } from "vitest";

import {
  DEFAULT_GATEWAY_TOKEN_TTL_SECONDS,
  mintGatewayToken,
  verifyGatewayToken,
} from "./gateway-token";

const SECRET = "test-secret-please-rotate";
const NOW = 1_750_000_000; // fixed epoch seconds for deterministic tests

describe("gateway-token", () => {
  it("round-trips and preserves the session id and allowed models", async () => {
    const token = await mintGatewayToken(
      { sid: "sess_abc", allowed_models: ["anthropic/claude-opus-4-8", "openai/gpt-5.4"] },
      SECRET,
      { now: NOW }
    );

    const result = await verifyGatewayToken(token, SECRET, { now: NOW });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.sid).toBe("sess_abc");
    expect(result.claims.allowed_models).toEqual(["anthropic/claude-opus-4-8", "openai/gpt-5.4"]);
  });

  it("defaults tenant to null when not provided", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET, { now: NOW });
    const result = await verifyGatewayToken(token, SECRET, { now: NOW });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.tenant).toBeNull();
  });

  it("preserves an explicit tenant claim", async () => {
    const token = await mintGatewayToken({ sid: "s", tenant: "acme", allowed_models: [] }, SECRET, {
      now: NOW,
    });
    const result = await verifyGatewayToken(token, SECRET, { now: NOW });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.tenant).toBe("acme");
  });

  it("sets exp to iat + ttl", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET, {
      now: NOW,
      ttlSeconds: 600,
    });
    const result = await verifyGatewayToken(token, SECRET, { now: NOW });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.iat).toBe(NOW);
    expect(result.claims.exp).toBe(NOW + 600);
  });

  it("uses the default ttl when none is given", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET, { now: NOW });
    const result = await verifyGatewayToken(token, SECRET, { now: NOW });

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.exp).toBe(NOW + DEFAULT_GATEWAY_TOKEN_TTL_SECONDS);
  });

  it("rejects an expired token", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET, {
      now: NOW,
      ttlSeconds: 60,
    });

    const result = await verifyGatewayToken(token, SECRET, { now: NOW + 61 });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("expired");
  });

  it("rejects a token at the exact expiry boundary", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET, {
      now: NOW,
      ttlSeconds: 60,
    });

    const result = await verifyGatewayToken(token, SECRET, { now: NOW + 60 });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("expired");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET, { now: NOW });

    const result = await verifyGatewayToken(token, "wrong-secret", { now: NOW });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("bad-signature");
  });

  it("rejects a token whose payload was tampered with", async () => {
    const token = await mintGatewayToken(
      { sid: "s", allowed_models: ["anthropic/claude-opus-4-8"] },
      SECRET,
      { now: NOW }
    );
    const [header, payload, signature] = token.split(".");
    const tampered = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
      string,
      unknown
    >;
    tampered.allowed_models = ["openai/gpt-5.4"];
    const forgedPayload = Buffer.from(JSON.stringify(tampered)).toString("base64url");
    const forged = `${header}.${forgedPayload}.${signature}`;

    const result = await verifyGatewayToken(forged, SECRET, { now: NOW });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("bad-signature");
  });

  it("rejects a malformed token", async () => {
    const result = await verifyGatewayToken("not-a-jwt", SECRET, { now: NOW });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("malformed");
  });

  it("rejects a token with a non-HS256 algorithm", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sid: "s", tenant: null, allowed_models: [], iat: NOW, exp: NOW + 60 })
    ).toString("base64url");
    const token = `${header}.${payload}.`;

    const result = await verifyGatewayToken(token, SECRET, { now: NOW });

    expect(result.valid).toBe(false);
  });
});
