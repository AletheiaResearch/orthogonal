import { describe, expect, it } from "vitest";

import type { ResolvedModelRef } from "../catalog/registry";
import { buildLanguageModel } from "./router";

function ref(
  p: Pick<ResolvedModelRef, "providerId" | "modelId" | "npm"> & { baseURL?: string }
): ResolvedModelRef {
  return {
    providerId: p.providerId,
    modelId: p.modelId,
    npm: p.npm,
    baseURL: p.baseURL,
    envKeys: [],
    model: {
      id: p.modelId,
      name: p.modelId,
      limit: { context: 1000, output: 1000 },
      modalities: { input: ["text"], output: ["text"] },
    },
    provider: { id: p.providerId, name: p.providerId, env: [], models: {} },
  };
}

describe("buildLanguageModel", () => {
  it("builds an Anthropic (native) model — V3, no baseURL needed", () => {
    const m = buildLanguageModel(
      ref({ providerId: "anthropic", modelId: "claude-opus-4-5", npm: "@ai-sdk/anthropic" }),
      "sk-ant"
    );
    expect(m.modelId).toBe("claude-opus-4-5");
    expect(m.specificationVersion).toBe("v3");
  });

  it("builds an OpenAI (native) model", () => {
    const m = buildLanguageModel(
      ref({ providerId: "openai", modelId: "gpt-5.4", npm: "@ai-sdk/openai" }),
      "sk-oai"
    );
    expect(m.modelId).toBe("gpt-5.4");
    expect(m.specificationVersion).toBe("v3");
  });

  it("builds an openai-compatible model from the registry baseURL", () => {
    const m = buildLanguageModel(
      ref({
        providerId: "openrouter",
        modelId: "anthropic/claude-sonnet-4.5",
        npm: "@ai-sdk/openai-compatible",
        baseURL: "https://openrouter.ai/api/v1",
      }),
      "sk-or"
    );
    expect(m.modelId).toBe("anthropic/claude-sonnet-4.5");
    expect(m.specificationVersion).toBe("v3");
  });

  it("throws when an openai-compatible provider has no baseURL", () => {
    expect(() =>
      buildLanguageModel(
        ref({ providerId: "weird", modelId: "m", npm: "@ai-sdk/openai-compatible" }),
        "k"
      )
    ).toThrow(/baseURL/i);
  });

  it("throws a 501-style error for an unsupported native adapter (e.g. google)", () => {
    expect(() =>
      buildLanguageModel(
        ref({ providerId: "google", modelId: "gemini-3", npm: "@ai-sdk/google" }),
        "k"
      )
    ).toThrow(/unsupported|adapter/i);
  });
});
