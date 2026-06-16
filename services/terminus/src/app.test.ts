import { mintGatewayToken } from "@open-inspect/shared";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";

import type { ModelsDevRegistry } from "./catalog/registry";
import type { Env } from "./env";
import { createApp } from "./index";
import type { UsageRecord, UsageSink } from "./usage/sink";

type MockArgs = ConstructorParameters<typeof MockLanguageModelV3>[0];
const LL_USAGE = {
  inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};

function capturingSink(): { sink: UsageSink; records: UsageRecord[] } {
  const records: UsageRecord[] = [];
  return {
    records,
    sink: {
      record: (r) => {
        records.push(r);
        return Promise.resolve();
      },
    },
  };
}

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

  it("proxies a non-streaming completion via the AI SDK and emits usage", async () => {
    const { sink, records } = capturingSink();
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "Hello there" }],
        finishReason: "stop",
        usage: LL_USAGE,
        warnings: [],
      },
    } as unknown as MockArgs);
    const gateway = createApp({
      loadRegistry: () => Promise.resolve(REGISTRY),
      usageSink: sink,
      chat: { buildModel: () => model },
    });

    const res = await gateway.request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-opus-4-5",
          messages: [{ role: "user", content: "hi" }],
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      object: string;
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.content).toBe("Hello there");
    expect(body.usage.prompt_tokens).toBe(5);
    expect(body.usage.completion_tokens).toBe(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sid: "sess_1",
      model: "anthropic/claude-opus-4-5",
      inputTokens: 5,
      outputTokens: 2,
    });
    // cost priced gateway-side from the registry model.cost {input:5, output:25} per 1M
    expect(records[0].costUsd).toBeCloseTo((5 * 5 + 2 * 25) / 1_000_000);
  });

  it("still returns 200 when the usage sink rejects (metering must not fail the response)", async () => {
    const rejectingSink: UsageSink = {
      record: () => Promise.reject(new Error("sink down")),
    };
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "Hello there" }],
        finishReason: "stop",
        usage: LL_USAGE,
        warnings: [],
      },
    } as unknown as MockArgs);
    const gateway = createApp({
      loadRegistry: () => Promise.resolve(REGISTRY),
      usageSink: rejectingSink,
      chat: { buildModel: () => model },
    });

    const res = await gateway.request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-opus-4-5",
          messages: [{ role: "user", content: "hi" }],
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    expect(body.choices[0].message.content).toBe("Hello there");
  });

  it("proxies a streaming completion as OpenAI SSE with a real usage chunk", async () => {
    const { sink, records } = capturingSink();
    const chunks = [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Hello" },
      { type: "text-delta", id: "t", delta: " there" },
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: "stop", usage: LL_USAGE },
    ];
    const model = new MockLanguageModelV3({
      doStream: { stream: simulateReadableStream({ chunks }) },
    } as unknown as MockArgs);
    const gateway = createApp({
      loadRegistry: () => Promise.resolve(REGISTRY),
      usageSink: sink,
      chat: { buildModel: () => model },
    });

    const res = await gateway.request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-opus-4-5",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain("[DONE]");
    const frames = text
      .split("\n\n")
      .filter((f) => f.startsWith("data: ") && !f.includes("[DONE]"))
      .map(
        (f) =>
          JSON.parse(f.slice("data: ".length)) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens: number; completion_tokens: number };
          }
      );

    const content = frames
      .map((f) => f.choices?.[0]?.delta?.content)
      .filter(Boolean)
      .join("");
    expect(content).toBe("Hello there");

    const usageChunk = frames.find((f) => f.usage);
    expect(usageChunk?.usage?.prompt_tokens).toBe(5);
    expect(usageChunk?.usage?.completion_tokens).toBe(2);
    expect(records[0]?.inputTokens).toBe(5);
  });
});
