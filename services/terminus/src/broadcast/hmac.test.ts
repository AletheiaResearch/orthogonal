import { describe, expect, it } from "vitest";

import { hmacSha256Hex } from "./hmac";

describe("hmacSha256Hex", () => {
  it("matches the canonical HMAC-SHA256 test vector", async () => {
    // RFC-adjacent well-known vector: HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog").
    expect(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
    );
  });

  it("is deterministic for the same key + message", async () => {
    const a = await hmacSha256Hex("k", "msg");
    const b = await hmacSha256Hex("k", "msg");
    expect(a).toBe(b);
  });

  it("changes with the key", async () => {
    const a = await hmacSha256Hex("k1", "msg");
    const b = await hmacSha256Hex("k2", "msg");
    expect(a).not.toBe(b);
  });
});
