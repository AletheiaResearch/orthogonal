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

  async function chat(body: unknown, allowed: string[] = []) {
    return app().request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await token(allowed)}`,
          "content-type": "application/json",
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      env
    );
  }

  it("rejects an invalid JSON body with 400", async () => {
    expect((await chat("not json")).status).toBe(400);
  });

  it("rejects a body missing model/messages with 400", async () => {
    expect((await chat({})).status).toBe(400);
  });

  it("rejects a model outside the token's allowed_models with 403", async () => {
    const res = await chat({ model: "anthropic/claude-opus-4-5", messages: [] }, [
      "openai/gpt-5.4",
    ]);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a model not in the catalog", async () => {
    const res = await chat({ model: "nope/whatever", messages: [] });
    expect(res.status).toBe(404);
  });

  it("returns 502 when the model's provider has no configured key", async () => {
    // env configures only ANTHROPIC_API_KEY, so openai is unconfigured.
    const res = await chat({ model: "openai/gpt-5.4", messages: [] });
    expect(res.status).toBe(502);
  });
});
