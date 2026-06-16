import { env } from "cloudflare:test";
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
});
