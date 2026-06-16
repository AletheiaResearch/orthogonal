import { mintGatewayToken } from "@open-inspect/shared";
import { describe, expect, it } from "vitest";

import type { ModelsDevRegistry } from "./catalog/registry";
import type { Env } from "./env";
import { createApp } from "./index";

const SECRET = "test-secret-please-rotate";

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
        modalities: { input: ["text"], output: ["text"] },
        cost: { input: 5, output: 25 },
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
      },
    },
  },
};

// Only Anthropic has a key configured → only its models should be advertised.
const env = { TERMINUS_JWT_SECRET: SECRET, ANTHROPIC_API_KEY: "sk-ant" } as unknown as Env;

function app() {
  return createApp({ loadRegistry: () => Promise.resolve(REGISTRY) });
}

async function token(allowed: string[] = []) {
  return mintGatewayToken({ sid: "sess_1", allowed_models: allowed }, SECRET);
}

describe("terminus app", () => {
  it("serves /health without auth", async () => {
    const res = await app().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "healthy", service: "terminus" });
  });

  it("requires a token on /v1/models", async () => {
    const res = await app().request("/v1/models", {}, env);
    expect(res.status).toBe(401);
  });

  it("lists only models of providers that have a configured key", async () => {
    const res = await app().request(
      "/v1/models",
      { headers: { Authorization: `Bearer ${await token()}` } },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { object: string; data: { id: string }[] };
    expect(body.object).toBe("list");
    expect(body.data.map((m) => m.id)).toEqual(["anthropic/claude-opus-4-5"]);
  });

  it("stubs chat completions with 501 until the proxy lands", async () => {
    const res = await app().request(
      "/v1/chat/completions",
      { method: "POST", headers: { Authorization: `Bearer ${await token()}` } },
      env
    );
    expect(res.status).toBe(501);
  });
});
