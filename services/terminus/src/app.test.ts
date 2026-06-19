import { mintGatewayToken } from "@open-inspect/shared";
import { APICallError } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";

import type { ModelsDevRegistry, ResolvedModelRef } from "./catalog/registry";
import type { CredentialProvider } from "./credentials/provider";
import type { Env } from "./env";
import { policyUnavailable } from "./errors";
import { createApp } from "./index";
import { type GuardrailPolicy, parsePolicy } from "./policy/blob";
import type { PolicyStore } from "./policy/store";
import type { TraceRecord, TraceSink } from "./trace/sink";
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

const env = { TERMINUS_JWT_SECRET: SECRET } as unknown as Env;

// Fake credential provider: only Anthropic is configured (mirrors the prior
// env-key behavior) so node-env tests need no D1 vault.
const credentials: CredentialProvider = {
  forModel: (ref) => Promise.resolve(ref.providerId === "anthropic" ? { apiKey: "sk-ant" } : null),
  forModelCandidates: (ref) =>
    Promise.resolve(
      ref.providerId === "anthropic"
        ? [
            {
              id: "anthropic-default",
              failureCount: 0,
              resolve: () => Promise.resolve({ apiKey: "sk-ant" }),
            },
          ]
        : []
    ),
  isEnabled: (providerId) => Promise.resolve(providerId === "anthropic"),
};

function app() {
  return createApp({
    loadRegistry: () => Promise.resolve(REGISTRY),
    buildCredentials: () => credentials,
  });
}

async function token(allowed: string[] = []) {
  return mintGatewayToken({ sid: "sess_1", allowed_models: allowed }, SECRET);
}

function policyStore(policy: GuardrailPolicy | null, opts?: { fail?: boolean }) {
  return {
    getActivePolicy: () =>
      opts?.fail ? Promise.reject(policyUnavailable()) : Promise.resolve(policy),
  } as unknown as PolicyStore;
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

  it("omits models denied by the active policy from /v1/models", async () => {
    const gateway = createApp({
      loadRegistry: () => Promise.resolve(REGISTRY),
      buildCredentials: () => credentials,
      buildPolicyStore: () =>
        policyStore(
          parsePolicy({
            schemaVersion: 1,
            guardrails: { deniedModels: ["anthropic/claude-opus-4-5"] },
          })
        ),
    });
    const res = await gateway.request(
      "/v1/models",
      { headers: { Authorization: `Bearer ${await token()}` } },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((m) => m.id)).toEqual([]);
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
      buildCredentials: () => credentials,
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
      buildCredentials: () => credentials,
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
      buildCredentials: () => credentials,
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

// A two-candidate pool (c1→k1, c2→k2) that records success/failure by id.
function poolProvider(): { provider: CredentialProvider; ok: string[]; fail: string[] } {
  const ok: string[] = [];
  const fail: string[] = [];
  const provider: CredentialProvider = {
    forModel: () => Promise.resolve(null),
    forModelCandidates: (ref) =>
      Promise.resolve(
        ref.providerId === "anthropic"
          ? [
              { id: "c1", failureCount: 0, resolve: () => Promise.resolve({ apiKey: "k1" }) },
              { id: "c2", failureCount: 0, resolve: () => Promise.resolve({ apiKey: "k2" }) },
            ]
          : []
      ),
    isEnabled: () => Promise.resolve(true),
    recordSuccess: (id) => {
      ok.push(id);
      return Promise.resolve();
    },
    recordFailure: (id) => {
      fail.push(id);
      return Promise.resolve();
    },
  };
  return { provider, ok, fail };
}

describe("terminus chat — credential pool fallback (CON-71)", () => {
  const success = (text: string): MockArgs =>
    ({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: "text", text }],
          finishReason: "stop",
          usage: LL_USAGE,
          warnings: [],
        }),
    }) as unknown as MockArgs;

  const throwing = (statusCode: number, isRetryable: boolean): MockArgs =>
    ({
      doGenerate: () =>
        Promise.reject(
          new APICallError({
            message: "upstream",
            url: "https://up/v1",
            requestBodyValues: {},
            statusCode,
            isRetryable,
          })
        ),
    }) as unknown as MockArgs;

  async function chat(
    provider: CredentialProvider,
    buildModel: (ref: ResolvedModelRef, apiKey: string) => MockLanguageModelV3,
    stream = false
  ) {
    const gateway = createApp({
      loadRegistry: () => Promise.resolve(REGISTRY),
      buildCredentials: () => provider,
      chat: { buildModel },
    });
    return gateway.request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-opus-4-5",
          messages: [{ role: "user", content: "hi" }],
          ...(stream ? { stream: true } : {}),
        }),
      },
      env
    );
  }

  it("falls back to the next candidate on a retryable upstream error", async () => {
    const { provider, ok, fail } = poolProvider();
    const seen: string[] = [];
    const res = await chat(provider, (_ref, apiKey) => {
      seen.push(apiKey);
      return new MockLanguageModelV3(apiKey === "k1" ? throwing(429, true) : success("from-k2"));
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    expect(body.choices[0].message.content).toBe("from-k2");
    expect(seen).toEqual(["k1", "k2"]);
    expect(fail).toEqual(["c1"]);
    expect(ok).toEqual(["c2"]);
  });

  it("does NOT retry on a terminal error (401) — fails fast on the first candidate", async () => {
    const { provider, ok, fail } = poolProvider();
    const seen: string[] = [];
    const res = await chat(provider, (_ref, apiKey) => {
      seen.push(apiKey);
      return new MockLanguageModelV3(throwing(401, false));
    });
    expect(res.status).toBe(502);
    expect(seen).toEqual(["k1"]);
    expect(fail).toEqual([]);
    expect(ok).toEqual([]);
  });

  it("returns a gateway error when every candidate fails", async () => {
    const { provider, fail } = poolProvider();
    const res = await chat(provider, () => new MockLanguageModelV3(throwing(503, true)));
    expect(res.status).toBe(502);
    expect(fail).toEqual(["c1", "c2"]);
  });

  it("streaming commits to the first healthy candidate (no fallback needed)", async () => {
    const { provider, ok } = poolProvider();
    const seen: string[] = [];
    const chunks = [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "hi" },
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: "stop", usage: LL_USAGE },
    ];
    const res = await chat(
      provider,
      (_ref, apiKey) => {
        seen.push(apiKey);
        return new MockLanguageModelV3({
          doStream: { stream: simulateReadableStream({ chunks }) },
        } as unknown as MockArgs);
      },
      true
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.text();
    expect(seen).toEqual(["k1"]);
    expect(ok).toEqual(["c1"]); // a successful stream clears the candidate's health state
  });

  it("returns 503 (transient) when every candidate is cooling down", async () => {
    const provider: CredentialProvider = {
      forModel: () => Promise.resolve(null),
      forModelCandidates: () => Promise.resolve([]), // all cooled → filtered to empty
      isEnabled: () => Promise.resolve(true), // ...but credentials DO exist
    };
    const res = await chat(provider, () => new MockLanguageModelV3(success("x")));
    expect(res.status).toBe(503);
  });

  // CON-74: streaming-request fallback via peek-first-chunk.
  const errFirst = (statusCode: number, isRetryable: boolean) => [
    { type: "stream-start", warnings: [] },
    {
      type: "error",
      error: new APICallError({
        message: "upstream",
        url: "https://up/v1",
        requestBodyValues: {},
        statusCode,
        isRetryable,
      }),
    },
  ];
  const okStream = (text: string) => [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: "stop", usage: LL_USAGE },
  ];
  const streamOf = (chunks: unknown[]) =>
    new MockLanguageModelV3({
      doStream: { stream: simulateReadableStream({ chunks }) },
    } as unknown as MockArgs);

  it("streaming falls back to the next candidate on a pre-first-token retryable error", async () => {
    const { provider, ok, fail } = poolProvider();
    const seen: string[] = [];
    const res = await chat(
      provider,
      (_ref, apiKey) => {
        seen.push(apiKey);
        return streamOf(apiKey === "k1" ? errFirst(429, true) : okStream("from-k2"));
      },
      true
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("from-k2");
    expect(seen).toEqual(["k1", "k2"]); // rotated to the healthy candidate
    expect(fail).toEqual(["c1"]);
    expect(ok).toEqual(["c2"]);
  });

  it("streaming returns a clean error status on a pre-first-token terminal error (no fallback)", async () => {
    const { provider, ok, fail } = poolProvider();
    const seen: string[] = [];
    const res = await chat(
      provider,
      (_ref, apiKey) => {
        seen.push(apiKey);
        return streamOf(errFirst(400, false));
      },
      true
    );
    expect(res.status).toBe(502); // clean status, no SSE bytes sent
    expect(seen).toEqual(["k1"]); // terminal → no fallback
    expect(fail).toEqual([]); // not cooled down (deterministic failure)
    expect(ok).toEqual([]);
  });

  it("streaming returns a clean error status when all candidates fail before the first token", async () => {
    const { provider, fail } = poolProvider();
    const res = await chat(provider, () => streamOf(errFirst(429, true)), true);
    expect(res.status).toBe(502);
    expect(fail).toEqual(["c1", "c2"]); // both cooled down after exhausting the pool
  });

  it("streaming does NOT retry after the first token; surfaces the error mid-stream", async () => {
    const { provider, fail } = poolProvider();
    const seen: string[] = [];
    const chunks = [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "partial" },
      {
        type: "error",
        error: new APICallError({
          message: "rate limited",
          url: "https://up/v1",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        }),
      },
    ];
    const res = await chat(
      provider,
      (_ref, apiKey) => {
        seen.push(apiKey);
        return streamOf(chunks);
      },
      true
    );
    expect(res.status).toBe(200); // already committed
    expect(await res.text()).toContain("partial"); // the committed token was delivered
    expect(seen).toEqual(["k1"]); // no fallback after commit
    expect(fail).toEqual(["c1"]); // cooled down for the NEXT request only
  });
});

describe("terminus chat — guardrail policy (CON-71 L2)", () => {
  const okModel = () =>
    new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: "text", text: "ok" }],
          finishReason: "stop",
          usage: LL_USAGE,
          warnings: [],
        }),
    } as unknown as MockArgs);

  async function chatWith(deps: Parameters<typeof createApp>[0], body?: unknown) {
    return createApp(deps).request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify(
          body ?? {
            model: "anthropic/claude-opus-4-5",
            messages: [{ role: "user", content: "hi" }],
          }
        ),
      },
      env
    );
  }

  it("is a pass-through when the active policy is null (behavior unchanged)", async () => {
    const res = await chatWith({
      loadRegistry: () => Promise.resolve(REGISTRY),
      buildCredentials: () => credentials,
      buildPolicyStore: () => policyStore(null),
      chat: { buildModel: () => okModel() },
    });
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { choices: { message: { content: string } }[] }).choices[0].message
        .content
    ).toBe("ok");
  });

  it("blocks a denied model with 403 before any credential lookup", async () => {
    const seen: string[] = [];
    const spy: CredentialProvider = {
      forModel: () => Promise.resolve(null),
      forModelCandidates: (ref) => {
        seen.push(ref.providerId);
        return Promise.resolve([]);
      },
      isEnabled: () => Promise.resolve(true),
    };
    const res = await chatWith({
      loadRegistry: () => Promise.resolve(REGISTRY),
      buildCredentials: () => spy,
      buildPolicyStore: () =>
        policyStore(
          parsePolicy({
            schemaVersion: 1,
            guardrails: { deniedModels: ["anthropic/claude-opus-4-5"] },
          })
        ),
      chat: { buildModel: () => okModel() },
    });
    expect(res.status).toBe(403);
    expect(seen).toEqual([]); // guardrail short-circuits before credential resolution
  });

  it("clamps max_tokens to the policy cap before the upstream call", async () => {
    let capturedMax: number | undefined;
    const res = await chatWith(
      {
        loadRegistry: () => Promise.resolve(REGISTRY),
        buildCredentials: () => credentials,
        buildPolicyStore: () =>
          policyStore(parsePolicy({ schemaVersion: 1, guardrails: { maxOutputTokensCap: 256 } })),
        chat: {
          buildModel: () =>
            new MockLanguageModelV3({
              doGenerate: (options: { maxOutputTokens?: number }) => {
                capturedMax = options.maxOutputTokens;
                return Promise.resolve({
                  content: [{ type: "text", text: "ok" }],
                  finishReason: "stop",
                  usage: LL_USAGE,
                  warnings: [],
                });
              },
            } as unknown as MockArgs),
        },
      },
      {
        model: "anthropic/claude-opus-4-5",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 9999,
      }
    );
    expect(res.status).toBe(200);
    expect(capturedMax).toBe(256);
  });

  it("clamps an omitted token limit to the model output ceiling when the policy cap is higher", async () => {
    let capturedMax: number | undefined;
    const res = await chatWith(
      {
        loadRegistry: () => Promise.resolve(REGISTRY),
        buildCredentials: () => credentials,
        buildPolicyStore: () =>
          policyStore(
            parsePolicy({ schemaVersion: 1, guardrails: { maxOutputTokensCap: 128000 } })
          ),
        chat: {
          buildModel: () =>
            new MockLanguageModelV3({
              doGenerate: (options: { maxOutputTokens?: number }) => {
                capturedMax = options.maxOutputTokens;
                return Promise.resolve({
                  content: [{ type: "text", text: "ok" }],
                  finishReason: "stop",
                  usage: LL_USAGE,
                  warnings: [],
                });
              },
            } as unknown as MockArgs),
        },
      },
      {
        model: "anthropic/claude-opus-4-5",
        messages: [{ role: "user", content: "hi" }],
      }
    );

    expect(res.status).toBe(200);
    expect(capturedMax).toBe(64000);
  });

  it("fails closed with 503 when the policy store errors", async () => {
    const res = await chatWith({
      loadRegistry: () => Promise.resolve(REGISTRY),
      buildCredentials: () => credentials,
      buildPolicyStore: () => policyStore(null, { fail: true }),
      chat: { buildModel: () => okModel() },
    });
    expect(res.status).toBe(503);
  });
});

function capturingTraceSink(): { sink: TraceSink; traces: TraceRecord[] } {
  const traces: TraceRecord[] = [];
  return {
    traces,
    sink: {
      record: (t) => {
        traces.push(t);
        return Promise.resolve();
      },
    },
  };
}

// Flag-on env: enables raw trace content-capture (CON-61). Default `env` leaves it off.
const captureEnv = { ...env, TERMINUS_TRACE_CAPTURE_ENABLED: "true" } as unknown as Env;

describe("terminus chat — trace content-capture (CON-61)", () => {
  const textGen = (text: string): MockLanguageModelV3 =>
    new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text }],
        finishReason: "stop",
        usage: LL_USAGE,
        warnings: [],
      },
    } as unknown as MockArgs);

  const textStream = (text: string): MockLanguageModelV3 =>
    new MockLanguageModelV3({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: text },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: "stop", usage: LL_USAGE },
          ],
        }),
      },
    } as unknown as MockArgs);

  async function chat(opts: {
    model: MockLanguageModelV3;
    traceSink?: TraceSink;
    stream?: boolean;
    env?: Env;
    tools?: unknown[];
  }) {
    const gateway = createApp({
      loadRegistry: () => Promise.resolve(REGISTRY),
      buildCredentials: () => credentials,
      traceSink: opts.traceSink,
      chat: { buildModel: () => opts.model },
    });
    return gateway.request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-opus-4-5",
          messages: [{ role: "user", content: "hi" }],
          ...(opts.tools ? { tools: opts.tools } : {}),
          ...(opts.stream ? { stream: true } : {}),
        }),
      },
      opts.env ?? env
    );
  }

  const SEARCH_TOOL = [
    {
      type: "function",
      function: {
        name: "search",
        parameters: { type: "object", properties: { q: { type: "string" } } },
      },
    },
  ];

  it("captures a non-streaming completion when the flag is on", async () => {
    const { sink, traces } = capturingTraceSink();
    const res = await chat({ model: textGen("Hello there"), traceSink: sink, env: captureEnv });

    expect(res.status).toBe(200);
    expect(traces).toHaveLength(1);
    expect(traces[0].requestMessages).toEqual([{ role: "user", content: "hi" }]);
    expect(traces[0].responseText).toBe("Hello there");
    expect(traces[0].responseToolCalls).toEqual([]);
    expect(traces[0].finishReason).toBe("stop");
    expect(traces[0].usage).toMatchObject({
      sid: "sess_1",
      model: "anthropic/claude-opus-4-5",
      inputTokens: 5,
      outputTokens: 2,
    });
    expect(traces[0].usage.costUsd).toBeCloseTo((5 * 5 + 2 * 25) / 1_000_000);
  });

  it("captures a streaming completion when the flag is on", async () => {
    const { sink, traces } = capturingTraceSink();
    const res = await chat({
      model: textStream("Hello there"),
      traceSink: sink,
      stream: true,
      env: captureEnv,
    });

    expect(res.status).toBe(200);
    await res.text(); // drain so the finish part fires onComplete → capture
    expect(traces).toHaveLength(1);
    expect(traces[0].requestMessages).toEqual([{ role: "user", content: "hi" }]);
    expect(traces[0].responseText).toBe("Hello there");
    expect(traces[0].finishReason).toBe("stop");
    expect(traces[0].usage.inputTokens).toBe(5);
  });

  it("does NOT capture a non-streaming completion when the flag is off (default)", async () => {
    const { sink, traces } = capturingTraceSink();
    const res = await chat({ model: textGen("Hello there"), traceSink: sink });

    expect(res.status).toBe(200);
    expect(traces).toEqual([]);
  });

  it("does NOT capture a streaming completion when the flag is off (default)", async () => {
    const { sink, traces } = capturingTraceSink();
    const res = await chat({ model: textStream("Hello there"), traceSink: sink, stream: true });

    expect(res.status).toBe(200);
    await res.text();
    expect(traces).toEqual([]);
  });

  it("still returns 200 when the trace sink rejects (capture must not fail the response)", async () => {
    const rejectingSink: TraceSink = { record: () => Promise.reject(new Error("trace sink down")) };
    const res = await chat({
      model: textGen("Hello there"),
      traceSink: rejectingSink,
      env: captureEnv,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    expect(body.choices[0].message.content).toBe("Hello there");
  });

  it("does NOT capture a trace when a committed stream errors before finish", async () => {
    const { sink, traces } = capturingTraceSink();
    // Emit a text-delta first so the peek (CON-74) commits the 200 SSE, THEN error
    // before any `finish` part. The committed stream surfaces the error mid-stream
    // (no fallback) and never reaches `finish` → onComplete never fires → no trace.
    const errorStream = new MockLanguageModelV3({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "partial" },
            {
              type: "error",
              error: new APICallError({
                message: "rate limited",
                url: "https://up/v1",
                requestBodyValues: {},
                statusCode: 429,
                isRetryable: true,
              }),
            },
          ],
        }),
      },
    } as unknown as MockArgs);

    const res = await chat({ model: errorStream, traceSink: sink, stream: true, env: captureEnv });
    expect(res.status).toBe(200);
    await res.text(); // drain so the error part is consumed
    expect(traces).toEqual([]);
  });

  it("captures a non-streaming tool call with the renamed id/name fields", async () => {
    const { sink, traces } = capturingTraceSink();
    const toolGen = new MockLanguageModelV3({
      doGenerate: {
        content: [
          { type: "tool-call", toolCallId: "call_1", toolName: "search", input: '{"q":"hi"}' },
        ],
        finishReason: "tool-calls",
        usage: LL_USAGE,
        warnings: [],
      },
    } as unknown as MockArgs);

    const res = await chat({
      model: toolGen,
      traceSink: sink,
      env: captureEnv,
      tools: SEARCH_TOOL,
    });

    expect(res.status).toBe(200);
    expect(traces).toHaveLength(1);
    // Asserts captureTrace's {toolCallId,toolName} -> {id,name} rename, the only new
    // mapping logic in the seam — and that finishReason maps to the OpenAI value.
    expect(traces[0].responseToolCalls).toEqual([
      { id: "call_1", name: "search", input: { q: "hi" } },
    ]);
  });

  it("captures a streaming tool call with the renamed id/name fields", async () => {
    const { sink, traces } = capturingTraceSink();
    const toolStream = new MockLanguageModelV3({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "search",
              input: '{"q":"hi"}',
            },
            { type: "finish", finishReason: "tool-calls", usage: LL_USAGE },
          ],
        }),
      },
    } as unknown as MockArgs);

    const res = await chat({
      model: toolStream,
      traceSink: sink,
      stream: true,
      env: captureEnv,
      tools: SEARCH_TOOL,
    });

    expect(res.status).toBe(200);
    await res.text(); // drain so the finish part fires onComplete → capture
    expect(traces).toHaveLength(1);
    expect(traces[0].responseToolCalls).toEqual([
      { id: "call_1", name: "search", input: { q: "hi" } },
    ]);
  });

  it("does not corrupt a live SSE stream when the trace sink throws/rejects mid-stream", async () => {
    // The streaming tap fires captureTrace from INSIDE the generator at the `finish`
    // part, before the finish/usage/[DONE] frames. A throwing OR rejecting sink must
    // not break the committed stream (spec §6/§8 — the load-bearing isolation seam).
    const hostileSink: TraceSink = {
      record: () => {
        throw new Error("trace sink exploded");
      },
    };

    const res = await chat({
      model: textStream("Hello there"),
      traceSink: hostileSink,
      stream: true,
      env: captureEnv,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    const frames = text
      .split("\n\n")
      .filter((f) => f.startsWith("data: ") && !f.includes("[DONE]"))
      .map(
        (f) =>
          JSON.parse(f.slice("data: ".length)) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens: number };
          }
      );
    const content = frames
      .map((f) => f.choices?.[0]?.delta?.content)
      .filter(Boolean)
      .join("");
    expect(content).toBe("Hello there");
    expect(frames.some((f) => f.usage)).toBe(true);
    expect(text).toContain("[DONE]");
  });
});
