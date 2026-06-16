import { describe, expect, it } from "vitest";

import { EnvKeyResolver, providerEnvVarName } from "./resolver";

describe("providerEnvVarName", () => {
  it("maps a simple provider id to <PROVIDER>_API_KEY", () => {
    expect(providerEnvVarName("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(providerEnvVarName("openai")).toBe("OPENAI_API_KEY");
    expect(providerEnvVarName("openrouter")).toBe("OPENROUTER_API_KEY");
  });

  it("uppercases and replaces non-alphanumeric characters with underscores", () => {
    expect(providerEnvVarName("google-vertex")).toBe("GOOGLE_VERTEX_API_KEY");
    expect(providerEnvVarName("amazon.bedrock")).toBe("AMAZON_BEDROCK_API_KEY");
  });
});

describe("EnvKeyResolver", () => {
  it("resolves a configured provider key from the environment", async () => {
    const resolver = new EnvKeyResolver({ OPENROUTER_API_KEY: "sk-or-123" });

    const cred = await resolver.resolve("openrouter");

    expect(cred).toEqual({ apiKey: "sk-or-123", source: "platform" });
  });

  it("returns null when no key is configured for the provider", async () => {
    const resolver = new EnvKeyResolver({ OPENAI_API_KEY: "sk-openai" });

    expect(await resolver.resolve("anthropic")).toBeNull();
  });

  it("ignores empty-string keys (treats them as unconfigured)", async () => {
    const resolver = new EnvKeyResolver({ ANTHROPIC_API_KEY: "" });

    expect(await resolver.resolve("anthropic")).toBeNull();
  });

  it("reports a provider as enabled only when a non-empty key exists", async () => {
    const resolver = new EnvKeyResolver({ OPENAI_API_KEY: "sk-openai", GROQ_API_KEY: "" });

    expect(await resolver.isEnabled("openai")).toBe(true);
    expect(await resolver.isEnabled("groq")).toBe(false);
    expect(await resolver.isEnabled("anthropic")).toBe(false);
  });

  it("honors an explicit env-var-name override for a provider", async () => {
    const resolver = new EnvKeyResolver(
      { CUSTOM_LLM_TOKEN: "tok" },
      { envVarOverrides: { "my-provider": "CUSTOM_LLM_TOKEN" } }
    );

    const cred = await resolver.resolve("my-provider");

    expect(cred).toEqual({ apiKey: "tok", source: "platform" });
  });

  it("ignores non-string env values when resolving (e.g. KV bindings)", async () => {
    const resolver = new EnvKeyResolver({
      ANTHROPIC_API_KEY: "sk-anthropic",
      MODELS_CACHE: { get: async () => null } as unknown as KVNamespace,
    });

    expect(await resolver.resolve("anthropic")).toEqual({
      apiKey: "sk-anthropic",
      source: "platform",
    });
  });
});

describe("EnvKeyResolver with registry-declared env keys", () => {
  it("resolves using a declared env key that differs from the convention", async () => {
    const resolver = new EnvKeyResolver({ GEMINI_API_KEY: "g-key" });

    const cred = await resolver.resolve("google", ["GOOGLE_API_KEY", "GEMINI_API_KEY"]);

    expect(cred).toEqual({ apiKey: "g-key", source: "platform" });
  });

  it("tries declared env keys in order and uses the first non-empty one", async () => {
    const resolver = new EnvKeyResolver({ A_KEY: "", B_KEY: "second" });

    const cred = await resolver.resolve("p", ["A_KEY", "B_KEY"]);

    expect(cred?.apiKey).toBe("second");
  });

  it("lets an explicit override win over declared env keys", async () => {
    const resolver = new EnvKeyResolver(
      { OVERRIDE_KEY: "win", DECLARED_KEY: "lose" },
      { envVarOverrides: { p: "OVERRIDE_KEY" } }
    );

    const cred = await resolver.resolve("p", ["DECLARED_KEY"]);

    expect(cred?.apiKey).toBe("win");
  });
});
