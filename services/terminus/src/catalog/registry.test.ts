import { describe, expect, it } from "vitest";

import { resolveModelRef, type ModelsDevRegistry } from "./registry";

const REGISTRY: ModelsDevRegistry = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    env: ["ANTHROPIC_API_KEY"],
    npm: "@ai-sdk/anthropic",
    models: {
      "claude-opus-4-5": {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5",
        reasoning: true,
        tool_call: true,
        attachment: true,
        limit: { context: 200000, output: 64000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
    },
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    env: ["OPENROUTER_API_KEY"],
    npm: "@ai-sdk/openai-compatible",
    api: "https://openrouter.ai/api/v1",
    models: {
      "anthropic/claude-sonnet-4.5": {
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5 (via OpenRouter)",
        reasoning: false,
        tool_call: true,
        attachment: false,
        limit: { context: 200000, output: 8192 },
        modalities: { input: ["text"], output: ["text"] },
      },
    },
  },
  fancyprov: {
    id: "fancyprov",
    name: "Fancy",
    env: ["FANCYPROV_API_KEY"],
    npm: "@ai-sdk/openai-compatible",
    api: "https://fancy.example/v1",
    models: {
      "weird-model": {
        id: "weird-model",
        name: "Weird",
        reasoning: false,
        tool_call: false,
        attachment: false,
        limit: { context: 1000, output: 1000 },
        modalities: { input: ["text"], output: ["text"] },
        // per-model override: a different adapter + baseURL than the parent
        provider: { npm: "@ai-sdk/openai-compatible", api: "https://override.example/v2" },
      },
    },
  },
};

describe("resolveModelRef", () => {
  it("resolves a native provider with no baseURL (anthropic)", () => {
    const ref = resolveModelRef(REGISTRY, "anthropic/claude-opus-4-5");

    expect(ref).not.toBeNull();
    expect(ref).toMatchObject({
      providerId: "anthropic",
      modelId: "claude-opus-4-5",
      npm: "@ai-sdk/anthropic",
      envKeys: ["ANTHROPIC_API_KEY"],
    });
    expect(ref?.baseURL).toBeUndefined();
  });

  it("resolves an openai-compatible provider with its registry baseURL", () => {
    const ref = resolveModelRef(REGISTRY, "openrouter/anthropic/claude-sonnet-4.5");

    expect(ref).toMatchObject({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-4.5",
      npm: "@ai-sdk/openai-compatible",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("splits the qualified id at the first slash only", () => {
    const ref = resolveModelRef(REGISTRY, "openrouter/anthropic/claude-sonnet-4.5");
    expect(ref?.modelId).toBe("anthropic/claude-sonnet-4.5");
  });

  it("honors a model-level provider override for baseURL", () => {
    const ref = resolveModelRef(REGISTRY, "fancyprov/weird-model");
    expect(ref?.baseURL).toBe("https://override.example/v2");
  });

  it("returns null for an unknown provider", () => {
    expect(resolveModelRef(REGISTRY, "nope/some-model")).toBeNull();
  });

  it("returns null for an unknown model under a known provider", () => {
    expect(resolveModelRef(REGISTRY, "anthropic/not-a-real-model")).toBeNull();
  });

  it("returns null for an unqualified id (no slash)", () => {
    expect(resolveModelRef(REGISTRY, "claude-opus-4-5")).toBeNull();
  });

  it("leaves credentialMode undefined for ordinary providers", () => {
    const ref = resolveModelRef(REGISTRY, "anthropic/claude-opus-4-5");
    expect(ref?.credentialMode).toBeUndefined();
  });

  it("propagates a provider's credentialMode onto the resolved ref", () => {
    const registry: ModelsDevRegistry = {
      synthetic: {
        id: "synthetic",
        name: "Synthetic",
        env: [],
        npm: "@ai-sdk/openai",
        api: "https://upstream.example/api",
        credentialMode: "codex-oauth",
        models: {
          "some-model": {
            id: "some-model",
            name: "Some Model",
            limit: { context: 1000, output: 1000 },
            modalities: { input: ["text"], output: ["text"] },
          },
        },
      },
    };

    const ref = resolveModelRef(registry, "synthetic/some-model");
    expect(ref?.credentialMode).toBe("codex-oauth");
  });
});
