import { describe, expect, it } from "vitest";

import { LLM_PROVIDER_API_KEY_ENV_VARS, withoutLlmProviderKeys } from "./llm-provider-keys";

describe("withoutLlmProviderKeys", () => {
  it("removes the platform LLM provider keys (anthropic + openai)", () => {
    const result = withoutLlmProviderKeys({
      ANTHROPIC_API_KEY: "sk-ant",
      OPENAI_API_KEY: "sk-oai",
      MY_APP_TOKEN: "keep-me",
    });

    expect(result).toEqual({ MY_APP_TOKEN: "keep-me" });
  });

  it("removes every curated LLM provider key", () => {
    const env: Record<string, string> = { KEEP: "yes" };
    for (const name of LLM_PROVIDER_API_KEY_ENV_VARS) {
      env[name] = "secret";
    }

    expect(withoutLlmProviderKeys(env)).toEqual({ KEEP: "yes" });
  });

  it("keeps non-LLM secrets, including unrelated *_API_KEY values", () => {
    const env = {
      STRIPE_API_KEY: "sk-stripe",
      SENDGRID_API_KEY: "sg-key",
      DATABASE_URL: "postgres://...",
    };

    expect(withoutLlmProviderKeys(env)).toEqual(env);
  });

  it("strips GOOGLE_API_KEY (models.dev's google provider accepts it as a Gemini credential)", () => {
    const result = withoutLlmProviderKeys({ GOOGLE_API_KEY: "g-key", KEEP: "v" });
    expect(result).toEqual({ KEEP: "v" });
  });

  it("does not mutate the input object", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant", KEEP: "v" };
    const result = withoutLlmProviderKeys(env);

    expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant", KEEP: "v" });
    expect(result).not.toBe(env);
  });

  it("returns an equal copy when there are no LLM keys", () => {
    const env = { KEEP: "v", OTHER: "w" };
    expect(withoutLlmProviderKeys(env)).toEqual(env);
  });

  it("is case-sensitive (env var names are conventionally uppercase)", () => {
    const env = { anthropic_api_key: "lower" };
    expect(withoutLlmProviderKeys(env)).toEqual(env);
  });
});
