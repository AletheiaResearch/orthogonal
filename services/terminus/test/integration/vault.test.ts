import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { providerCredentials } from "../../src/db/schema";
import { CredentialVault } from "../../src/db/vault";

const db = drizzle(env.DB);
const vault = new CredentialVault(db, env.CREDENTIALS_ENCRYPTION_KEY);

afterEach(async () => {
  await db.delete(providerCredentials);
});

describe("CredentialVault (D1, encrypted at rest)", () => {
  it("round-trips an api key through encrypt-at-rest", async () => {
    await vault.putApiKey({ provider: "anthropic", apiKey: "sk-ant-123" });
    expect(await vault.getCredential("anthropic")).toEqual({
      mode: "api_key",
      apiKey: "sk-ant-123",
    });
  });

  it("stores the secret encrypted — no plaintext at rest", async () => {
    await vault.putApiKey({ provider: "openai", apiKey: "sk-oai-XYZ" });
    const [row] = await db.select().from(providerCredentials).all();
    expect(row.secretEncrypted).not.toContain("sk-oai-XYZ");
  });

  it("returns null for an unconfigured provider", async () => {
    expect(await vault.getCredential("mistral")).toBeNull();
  });

  it("upserts — one row per owner+provider, last write wins", async () => {
    await vault.putApiKey({ provider: "anthropic", apiKey: "k1" });
    await vault.putApiKey({ provider: "anthropic", apiKey: "k2" });
    expect((await db.select().from(providerCredentials).all()).length).toBe(1);
    expect(await vault.getCredential("anthropic")).toEqual({ mode: "api_key", apiKey: "k2" });
  });

  it("lists only enabled providers without decrypting", async () => {
    await vault.putApiKey({ provider: "anthropic", apiKey: "k1" });
    await vault.putApiKey({ provider: "openrouter", apiKey: "k2", enabled: false });
    await vault.putCodexCredential({ refreshToken: "rt" });
    expect((await vault.listEnabledProviders()).toSorted()).toEqual(["anthropic", "codex"]);
  });

  it("round-trips Codex OAuth components", async () => {
    await vault.putCodexCredential({
      refreshToken: "rt-1",
      accessToken: "at-1",
      accountId: "acc-1",
      expiresAtMs: 5000,
    });
    expect(await vault.getCredential("codex")).toEqual({
      mode: "codex-oauth",
      refreshToken: "rt-1",
      accessToken: "at-1",
      accountId: "acc-1",
      expiresAtMs: 5000,
    });
  });

  it("scopes credentials by owner (platform vs tenant)", async () => {
    await vault.putApiKey({
      provider: "anthropic",
      apiKey: "sk",
      owner: { type: "tenant", id: "t1" },
    });
    expect(await vault.getCredential("anthropic")).toBeNull();
    expect(await vault.getCredential("anthropic", { type: "tenant", id: "t1" })).toEqual({
      mode: "api_key",
      apiKey: "sk",
    });
  });

  it("never serves a disabled credential (revocation is terminal)", async () => {
    await vault.putApiKey({ provider: "openrouter", apiKey: "k", enabled: false });
    expect(await vault.getCredential("openrouter")).toBeNull();
    expect(await vault.listEnabledProviders()).toEqual([]);
    expect(await vault.listAllProviders()).toEqual(["openrouter"]);
  });

  it("rejects empty secrets before persisting", async () => {
    await expect(vault.putApiKey({ provider: "openai", apiKey: "" })).rejects.toThrow();
    await expect(vault.putCodexCredential({ refreshToken: "" })).rejects.toThrow();
    expect(await db.select().from(providerCredentials).all()).toEqual([]);
  });

  it("seedCodexCredential is insert-if-absent — never clobbers a rotated row", async () => {
    await vault.putCodexCredential({
      refreshToken: "rt-rotated",
      accessToken: "at-rotated",
      accountId: "acc",
      expiresAtMs: 9_000_000,
    });
    // A late seed carrying the original (consumed) token must NOT overwrite the rotation.
    await vault.seedCodexCredential({ refreshToken: "rt-seed-stale", accountId: "acc" });
    expect(await vault.getCredential("codex")).toMatchObject({
      refreshToken: "rt-rotated",
      accessToken: "at-rotated",
    });
  });

  it("binds ciphertext to its owner — a tampered owner row fails to decrypt", async () => {
    await vault.putApiKey({ provider: "anthropic", apiKey: "sk-secret" });
    // Move the row to a different owner without re-encrypting → AAD no longer matches.
    await db
      .update(providerCredentials)
      .set({ ownerType: "tenant", ownerId: "attacker" })
      .where(eq(providerCredentials.provider, "anthropic"));
    await expect(
      vault.getCredential("anthropic", { type: "tenant", id: "attacker" })
    ).rejects.toThrow();
  });
});

describe("CredentialVault — pool + admin (CON-71 / CON-70)", () => {
  const rowById = async (id: string) =>
    (await db.select().from(providerCredentials).where(eq(providerCredentials.id, id)))[0];

  it("createCredential supports multiple labeled rows per (owner, provider)", async () => {
    await vault.createCredential({
      provider: "openai",
      apiKey: "k-a",
      label: "a",
      priority: 5,
      weight: 2,
    });
    await vault.createCredential({ provider: "openai", apiKey: "k-b", label: "b", priority: 1 });
    const rows = await vault.getCredentials("openai");
    expect(rows.map((r) => r.label).toSorted()).toEqual(["a", "b"]);
    expect(rows.find((r) => r.label === "a")?.priority).toBe(5);
    expect(rows.find((r) => r.label === "a")?.weight).toBe(2);
  });

  it("listEnabledProviders / listAllProviders dedupe a multi-credential pool", async () => {
    await vault.createCredential({ provider: "openai", apiKey: "k-a", label: "a" });
    await vault.createCredential({ provider: "openai", apiKey: "k-b", label: "b" });
    expect(await vault.listEnabledProviders()).toEqual(["openai"]);
    expect(await vault.listAllProviders()).toEqual(["openai"]);
  });

  it("getCredentials returns only enabled rows and does not decrypt", async () => {
    await vault.createCredential({ provider: "openai", apiKey: "k-a", label: "a" });
    await vault.createCredential({ provider: "openai", apiKey: "k-b", label: "b", enabled: false });
    const rows = await vault.getCredentials("openai");
    expect(rows.map((r) => r.label)).toEqual(["a"]);
    expect(rows[0].secretEncrypted).not.toContain("k-a");
  });

  it("decryptById: plaintext for the matching owner; null for wrong owner or disabled", async () => {
    const { id } = await vault.createCredential({ provider: "openai", apiKey: "k-a", label: "a" });
    expect(await vault.decryptById(id, { type: "platform", id: "" })).toEqual({
      mode: "api_key",
      apiKey: "k-a",
    });
    expect(await vault.decryptById(id, { type: "tenant", id: "x" })).toBeNull();
    await vault.setEnabled(id, false);
    expect(await vault.decryptById(id, { type: "platform", id: "" })).toBeNull();
  });

  it("recordFailure sets cooldown + increments; recordSuccess clears", async () => {
    const { id } = await vault.createCredential({ provider: "openai", apiKey: "k", label: "a" });
    await vault.recordFailure(id, 9999);
    expect(await rowById(id)).toMatchObject({ cooldownUntilMs: 9999, failureCount: 1 });
    await vault.recordFailure(id, 12000);
    expect(await rowById(id)).toMatchObject({ cooldownUntilMs: 12000, failureCount: 2 });
    await vault.recordSuccess(id);
    expect(await rowById(id)).toMatchObject({ cooldownUntilMs: null, failureCount: 0 });
  });

  it("listForOwner returns public fields only — never the secret", async () => {
    await vault.createCredential({ provider: "openai", apiKey: "k-secret", label: "a" });
    const list = await vault.listForOwner();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      provider: "openai",
      label: "a",
      credentialMode: "api_key",
      enabled: true,
    });
    expect(JSON.stringify(list[0])).not.toContain("k-secret");
    expect("secretEncrypted" in list[0]).toBe(false);
  });

  it("setEnabled and deleteCredential are owner-scoped and report whether a row matched", async () => {
    const { id } = await vault.createCredential({ provider: "openai", apiKey: "k", label: "a" });
    expect(await vault.setEnabled(id, false, { type: "tenant", id: "other" })).toBe(false);
    expect(await vault.setEnabled(id, false)).toBe(true);
    expect(await vault.getCredentials("openai")).toEqual([]);
    expect(await vault.deleteCredential(id)).toBe(true);
    expect(await vault.deleteCredential(id)).toBe(false);
  });

  it("listCodexRowsNearExpiry returns codex rows (any owner) at/under threshold or null expiry", async () => {
    await vault.putCodexCredential({ refreshToken: "rt-plat", expiresAtMs: 1000 });
    await vault.putCodexCredential({
      refreshToken: "rt-t",
      expiresAtMs: 50000,
      owner: { type: "tenant", id: "t1" },
    });
    await vault.putApiKey({ provider: "openai", apiKey: "k" });
    const near = await vault.listCodexRowsNearExpiry(2000);
    expect(near.map((r) => `${r.ownerType}:${r.ownerId}`)).toEqual(["platform:"]);
    expect((await vault.listCodexRowsNearExpiry(60000)).length).toBe(2);
    // Boundary: a row whose expiry equals the threshold is included (at/under).
    expect((await vault.listCodexRowsNearExpiry(1000)).length).toBe(1);
  });
});
