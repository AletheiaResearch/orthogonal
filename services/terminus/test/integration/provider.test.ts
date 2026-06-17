import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import type { ResolvedModelRef } from "../../src/catalog/registry";
import { CodexTokenManager } from "../../src/credentials/codex-manager";
import { VaultCredentialProvider } from "../../src/credentials/provider";
import { providerCredentials } from "../../src/db/schema";
import { CredentialVault } from "../../src/db/vault";

const db = drizzle(env.DB);

afterEach(async () => {
  await db.delete(providerCredentials);
});

function ref(
  providerId: string,
  opts: { npm?: string; baseURL?: string; envKeys?: string[]; credentialMode?: "codex-oauth" } = {}
): ResolvedModelRef {
  return {
    providerId,
    modelId: "m",
    npm: opts.npm ?? "@ai-sdk/openai-compatible",
    baseURL: opts.baseURL,
    envKeys: opts.envKeys ?? [],
    credentialMode: opts.credentialMode,
    model: {
      id: "m",
      name: "m",
      limit: { context: 1, output: 1 },
      modalities: { input: [], output: [] },
    },
    provider: { id: providerId, name: providerId, env: opts.envKeys ?? [], models: {} },
  };
}

function newVault() {
  return new CredentialVault(db, env.CREDENTIALS_ENCRYPTION_KEY);
}

function provider(workerEnv: Record<string, unknown>) {
  const vault = newVault();
  const codex = new CodexTokenManager(vault, {
    refresh: async () => ({
      accessToken: "cdx-access",
      refreshToken: "rt2",
      accountId: "acct",
      expiresInSeconds: 3600,
    }),
    now: () => 0,
  });
  return new VaultCredentialProvider({ vault, codex, env: workerEnv });
}

describe("VaultCredentialProvider", () => {
  it("resolves an api key already in the vault", async () => {
    await newVault().putApiKey({ provider: "anthropic", apiKey: "sk-vault" });
    const cred = await provider({}).forModel(
      ref("anthropic", { envKeys: ["ANTHROPIC_API_KEY"] }),
      "sid"
    );
    expect(cred).toEqual({ apiKey: "sk-vault" });
  });

  it("lazily seeds an api key from a Worker secret into the vault on miss", async () => {
    const cred = await provider({ ANTHROPIC_API_KEY: "sk-env" }).forModel(
      ref("anthropic", { envKeys: ["ANTHROPIC_API_KEY"] }),
      "sid"
    );
    expect(cred).toEqual({ apiKey: "sk-env" });
    expect(await newVault().getCredential("anthropic")).toEqual({
      mode: "api_key",
      apiKey: "sk-env",
    });
  });

  it("returns null for an unconfigured provider (no vault row, no env key)", async () => {
    const cred = await provider({}).forModel(
      ref("mistral", { envKeys: ["MISTRAL_API_KEY"] }),
      "sid"
    );
    expect(cred).toBeNull();
  });

  it("resolves codex via the token manager, seeding from CODEX_OAUTH_* on first use", async () => {
    const cred = await provider({
      CODEX_OAUTH_REFRESH_TOKEN: "rt-seed",
      CODEX_OAUTH_ACCOUNT_ID: "acct-seed",
    }).forModel(
      ref("codex", {
        npm: "@ai-sdk/openai",
        baseURL: "https://chatgpt.com/backend-api/codex",
        credentialMode: "codex-oauth",
      }),
      "sid"
    );
    expect(cred).toEqual({ apiKey: "cdx-access", accountId: "acct" });
  });

  it("isEnabled covers vault, env-key, and seedable-codex providers", async () => {
    await newVault().putApiKey({ provider: "openrouter", apiKey: "k" });
    const p = provider({ ANTHROPIC_API_KEY: "sk", CODEX_OAUTH_REFRESH_TOKEN: "rt" });
    expect(await p.isEnabled("openrouter", ["OPENROUTER_API_KEY"])).toBe(true);
    expect(await p.isEnabled("anthropic", ["ANTHROPIC_API_KEY"])).toBe(true);
    expect(await p.isEnabled("codex", [])).toBe(true);
    expect(await p.isEnabled("mistral", ["MISTRAL_API_KEY"])).toBe(false);
  });

  it("treats a disabled provider as terminal — not served or reseeded from env", async () => {
    await newVault().putApiKey({ provider: "anthropic", apiKey: "k", enabled: false });
    const p = provider({ ANTHROPIC_API_KEY: "sk-env" });
    expect(
      await p.forModel(ref("anthropic", { envKeys: ["ANTHROPIC_API_KEY"] }), "sid")
    ).toBeNull();
    expect(await p.isEnabled("anthropic", ["ANTHROPIC_API_KEY"])).toBe(false);
    // The disabled row is unchanged (not resurrected to enabled).
    expect(await newVault().getCredential("anthropic")).toBeNull();
  });

  it("treats a whitespace-only Codex seed as unset", async () => {
    const p = provider({ CODEX_OAUTH_REFRESH_TOKEN: "   " });
    expect(await p.isEnabled("codex", [])).toBe(false);
    const cred = await p.forModel(
      ref("codex", { npm: "@ai-sdk/openai", credentialMode: "codex-oauth" }),
      "sid"
    );
    expect(cred).toBeNull();
    expect(await newVault().getCredential("codex")).toBeNull();
  });
});
