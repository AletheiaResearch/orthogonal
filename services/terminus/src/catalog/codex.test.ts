import { describe, expect, it } from "vitest";

import {
  CODEX_ALLOWED_MODELS,
  CODEX_BASE_URL,
  CODEX_PROVIDER_ID,
  codexProvider,
  withCodexProvider,
} from "./codex";
import { resolveModelRef, type ModelsDevRegistry } from "./registry";

describe("codexProvider", () => {
  it("is a synthetic openai responses provider marked codex-oauth", () => {
    const provider = codexProvider();
    expect(provider).toMatchObject({
      id: CODEX_PROVIDER_ID,
      npm: "@ai-sdk/openai",
      api: CODEX_BASE_URL,
      credentialMode: "codex-oauth",
    });
  });

  it("exposes every allowed Codex model at zero cost (subscription-priced)", () => {
    const provider = codexProvider();
    expect(Object.keys(provider.models).toSorted()).toEqual([...CODEX_ALLOWED_MODELS].toSorted());
    for (const model of Object.values(provider.models)) {
      expect(model.cost).toEqual({ input: 0, output: 0 });
    }
  });
});

describe("withCodexProvider", () => {
  const base: ModelsDevRegistry = {
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      env: ["ANTHROPIC_API_KEY"],
      npm: "@ai-sdk/anthropic",
      models: {
        "claude-opus-4-5": {
          id: "claude-opus-4-5",
          name: "Claude Opus 4.5",
          limit: { context: 200000, output: 64000 },
          modalities: { input: ["text"], output: ["text"] },
        },
      },
    },
  };

  it("merges the codex provider without mutating the input registry", () => {
    const merged = withCodexProvider(base);
    expect(merged[CODEX_PROVIDER_ID]).toBeDefined();
    expect(merged.anthropic).toBeDefined();
    expect(base[CODEX_PROVIDER_ID]).toBeUndefined();
  });

  it("lets resolveModelRef resolve a codex/* id to the codex-oauth ref", () => {
    const merged = withCodexProvider(base);
    const ref = resolveModelRef(merged, `${CODEX_PROVIDER_ID}/gpt-5.3-codex`);
    expect(ref).toMatchObject({
      providerId: CODEX_PROVIDER_ID,
      modelId: "gpt-5.3-codex",
      npm: "@ai-sdk/openai",
      baseURL: CODEX_BASE_URL,
      credentialMode: "codex-oauth",
    });
  });
});
