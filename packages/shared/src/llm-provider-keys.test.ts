import { describe, expect, it } from "vitest";

import {
  LLM_PROVIDER_CREDENTIAL_ENV_VARS,
  withoutLlmProviderCredentials,
} from "./llm-provider-keys";

describe("withoutLlmProviderCredentials", () => {
  it("removes the platform LLM provider keys (anthropic + openai)", () => {
    const result = withoutLlmProviderCredentials({
      ANTHROPIC_API_KEY: "sk-ant",
      OPENAI_API_KEY: "sk-oai",
      MY_APP_TOKEN: "keep-me",
    });

    expect(result).toEqual({ MY_APP_TOKEN: "keep-me" });
  });

  it("removes every curated LLM provider credential", () => {
    const env: Record<string, string> = { KEEP: "yes" };
    for (const name of LLM_PROVIDER_CREDENTIAL_ENV_VARS) {
      env[name] = "secret";
    }

    expect(withoutLlmProviderCredentials(env)).toEqual({ KEEP: "yes" });
  });

  it("keeps non-LLM secrets, including unrelated *_API_KEY values", () => {
    const env = {
      STRIPE_API_KEY: "sk-stripe",
      SENDGRID_API_KEY: "sg-key",
      DATABASE_URL: "postgres://...",
    };

    expect(withoutLlmProviderCredentials(env)).toEqual(env);
  });

  it("strips GOOGLE_API_KEY (models.dev's google provider accepts it as a Gemini credential)", () => {
    const result = withoutLlmProviderCredentials({ GOOGLE_API_KEY: "g-key", KEEP: "v" });
    expect(result).toEqual({ KEEP: "v" });
  });

  it("strips convention-derived keys for fronted cloud providers (vertex, bedrock)", () => {
    const result = withoutLlmProviderCredentials({
      GOOGLE_VERTEX_API_KEY: "v-key",
      AMAZON_BEDROCK_API_KEY: "b-key",
      KEEP: "v",
    });
    expect(result).toEqual({ KEEP: "v" });
  });

  it("strips the OpenAI OAuth refresh token (Codex auth-proxy credential, not an API key)", () => {
    const result = withoutLlmProviderCredentials({
      OPENAI_OAUTH_REFRESH_TOKEN: "rt-secret",
      KEEP: "v",
    });
    expect(result).toEqual({ KEEP: "v" });
  });

  it("does not mutate the input object", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant", KEEP: "v" };
    const result = withoutLlmProviderCredentials(env);

    expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant", KEEP: "v" });
    expect(result).not.toBe(env);
  });

  it("returns an equal copy when there are no LLM credentials", () => {
    const env = { KEEP: "v", OTHER: "w" };
    expect(withoutLlmProviderCredentials(env)).toEqual(env);
  });

  it("is case-sensitive (env var names are conventionally uppercase)", () => {
    const env = { anthropic_api_key: "lower" };
    expect(withoutLlmProviderCredentials(env)).toEqual(env);
  });
});
