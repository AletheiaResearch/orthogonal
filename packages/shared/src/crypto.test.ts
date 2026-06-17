import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, generateEncryptionKey } from "./crypto";

describe("secret encryption (AES-256-GCM)", () => {
  const key = generateEncryptionKey();

  it("round-trips a secret without AAD", async () => {
    const ciphertext = await encryptSecret("sk-secret-123", key);
    expect(ciphertext).not.toContain("sk-secret-123");
    expect(await decryptSecret(ciphertext, key)).toBe("sk-secret-123");
  });

  it("uses a fresh IV so ciphertext differs each call", async () => {
    const a = await encryptSecret("same", key);
    const b = await encryptSecret("same", key);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, key)).toBe("same");
  });

  it("binds ciphertext to its AAD (owner) — decrypt requires the same AAD", async () => {
    const ciphertext = await encryptSecret("token", key, "platform");
    expect(await decryptSecret(ciphertext, key, "platform")).toBe("token");
    await expect(decryptSecret(ciphertext, key, "tenant-42")).rejects.toThrow();
  });

  it("keeps AAD optional — a no-AAD ciphertext won't decrypt when an AAD is demanded", async () => {
    const ciphertext = await encryptSecret("token", key);
    expect(await decryptSecret(ciphertext, key)).toBe("token");
    await expect(decryptSecret(ciphertext, key, "platform")).rejects.toThrow();
  });

  it("generates distinct 256-bit base64 keys", () => {
    const k1 = generateEncryptionKey();
    const k2 = generateEncryptionKey();
    expect(k1).not.toBe(k2);
    expect(Uint8Array.from(atob(k1), (c) => c.charCodeAt(0)).length).toBe(32);
  });
});
