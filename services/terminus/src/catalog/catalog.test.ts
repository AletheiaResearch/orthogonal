import { describe, expect, it } from "vitest";

import type { CredentialResolver, ResolvedCredential } from "../credentials/resolver";
import { parsePolicy } from "../policy/blob";
import { buildModelsList } from "./catalog";
import type { ModelsDevRegistry } from "./registry";

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
        limit: { context: 200000, output: 64000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    env: ["OPENAI_API_KEY"],
    npm: "@ai-sdk/openai",
    models: {
      "gpt-5.4": {
        id: "gpt-5.4",
        name: "GPT 5.4",
        limit: { context: 400000, output: 128000 },
        modalities: { input: ["text"], output: ["text"] },
        cost: { input: 1.25, output: 10 },
      },
    },
  },
};

/** Resolver enabling only the providers whose ids are in the given set. */
function resolverFor(enabled: Set<string>): CredentialResolver {
  return {
    resolve(providerId): Promise<ResolvedCredential | null> {
      return Promise.resolve(enabled.has(providerId) ? { apiKey: "k", source: "platform" } : null);
    },
    isEnabled(providerId): Promise<boolean> {
      return Promise.resolve(enabled.has(providerId));
    },
  };
}

describe("buildModelsList", () => {
  it("lists only models of providers that have a credential", async () => {
    const list = await buildModelsList(REGISTRY, resolverFor(new Set(["anthropic"])), []);

    expect(list.object).toBe("list");
    expect(list.data.map((m) => m.id)).toEqual(["anthropic/claude-opus-4-5"]);
  });

  it("omits all models when no provider is enabled", async () => {
    const list = await buildModelsList(REGISTRY, resolverFor(new Set()), []);
    expect(list.data).toEqual([]);
  });

  it("returns OpenAI-shaped model objects enriched with catalog metadata", async () => {
    const list = await buildModelsList(REGISTRY, resolverFor(new Set(["anthropic"])), []);

    expect(list.data[0]).toMatchObject({
      id: "anthropic/claude-opus-4-5",
      object: "model",
      owned_by: "anthropic",
      context_window: 200000,
      max_output_tokens: 64000,
      pricing: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
    });
  });

  it("narrows the catalog to the token's allowed_models when non-empty", async () => {
    const list = await buildModelsList(REGISTRY, resolverFor(new Set(["anthropic", "openai"])), [
      "openai/gpt-5.4",
    ]);

    expect(list.data.map((m) => m.id)).toEqual(["openai/gpt-5.4"]);
  });

  it("treats an empty allowed_models as unrestricted (all enabled)", async () => {
    const list = await buildModelsList(REGISTRY, resolverFor(new Set(["anthropic", "openai"])), []);

    expect(list.data.map((m) => m.id).toSorted()).toEqual([
      "anthropic/claude-opus-4-5",
      "openai/gpt-5.4",
    ]);
  });

  it("omits models blocked by the active guardrail policy", async () => {
    const list = await buildModelsList(
      REGISTRY,
      resolverFor(new Set(["anthropic", "openai"])),
      [],
      parsePolicy({
        schemaVersion: 1,
        guardrails: { deniedModels: ["openai/gpt-5.4"] },
      })
    );

    expect(list.data.map((m) => m.id)).toEqual(["anthropic/claude-opus-4-5"]);
  });

  it("sorts models by id for stable output", async () => {
    const list = await buildModelsList(REGISTRY, resolverFor(new Set(["anthropic", "openai"])), []);
    const ids = list.data.map((m) => m.id);
    expect(ids).toEqual([...ids].toSorted());
  });
});
