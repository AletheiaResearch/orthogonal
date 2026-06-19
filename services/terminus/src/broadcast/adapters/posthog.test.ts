import { describe, expect, it } from "vitest";

import type { EmissionMetrics, EmissionRecord } from "../record";
import type { PosthogConfig } from "./posthog";
import { PosthogDestination } from "./posthog";

/** A captured outbound request, with the body parsed back from its JSON string. */
interface CapturedRequest {
  url: string;
  method?: string;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
  redirect?: string;
  body: Record<string, unknown>;
}

/**
 * A fake `fetch` that records the (single) request it receives and returns the given
 * Response. The body string is parsed back so tests can assert the true wire shape and,
 * critically, the ABSENCE of keys.
 */
function captureFetch(response: Response) {
  const calls: CapturedRequest[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    const rawBody = init?.body;
    calls.push({
      url: String(url),
      method: init?.method,
      headers: init?.headers,
      signal: init?.signal,
      redirect: init?.redirect,
      body: typeof rawBody === "string" ? JSON.parse(rawBody) : {},
    });
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function metrics(overrides: Partial<EmissionMetrics> = {}): EmissionMetrics {
  return {
    traceId: "trace-abc",
    sessionId: "sess-123",
    tenant: null,
    model: "anthropic/claude-opus-4-5",
    provider: "anthropic",
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    reasoningTokens: 50,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    costUsd: 0.0123,
    startedAtMs: 1_000,
    finishedAtMs: 1_900,
    latencyMs: 900,
    finishReason: "stop",
    ...overrides,
  };
}

function record(overrides: Partial<EmissionMetrics> = {}): EmissionRecord {
  return { metrics: metrics(overrides) };
}

function config(overrides: Partial<PosthogConfig> = {}): PosthogConfig {
  return {
    id: "dest-posthog-1",
    samplingRate: 1,
    projectApiKey: "phc_project_key",
    ...overrides,
  };
}

const props = (call: CapturedRequest) => call.body.properties as Record<string, unknown>;

describe("PosthogDestination", () => {
  it("exposes id, type, and samplingRate from config", () => {
    const dest = new PosthogDestination(config({ samplingRate: 0.25 }));
    expect(dest.id).toBe("dest-posthog-1");
    expect(dest.type).toBe("posthog");
    expect(dest.samplingRate).toBe(0.25);
  });

  it("POSTs to the capture endpoint at the default host", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(calls[0].method).toBe("POST");
  });

  it("uses a custom host when configured", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config({ host: "https://eu.i.posthog.com" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].url).toBe("https://eu.i.posthog.com/i/v0/e/");
  });

  it("sends ONLY a content-type header — no Authorization header", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    // Exact equality catches any stray Authorization header in one shot.
    expect(calls[0].headers).toEqual({ "content-type": "application/json" });
    expect(calls[0].redirect).toBe("manual");
  });

  it("carries the project key in body.api_key, never in a header", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config({ projectApiKey: "phc_secret" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].body.api_key).toBe("phc_secret");
    expect(calls[0].headers).not.toHaveProperty("Authorization");
    expect(calls[0].headers).not.toHaveProperty("authorization");
  });

  it("builds the capture envelope: event, distinct_id (= sessionId)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record({ sessionId: "sess-XYZ" }), new AbortController().signal);

    expect(calls[0].body.event).toBe("$ai_generation");
    expect(calls[0].body.distinct_id).toBe("sess-XYZ");
  });

  it("derives a BARE $ai_model (strips the provider/ prefix) and keeps $ai_provider separate", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(
      record({ model: "anthropic/claude-opus-4-5", provider: "anthropic" }),
      new AbortController().signal
    );

    expect(props(calls[0])["$ai_model"]).toBe("claude-opus-4-5");
    expect(props(calls[0])["$ai_provider"]).toBe("anthropic");
  });

  it("treats a model with no slash as the whole bare model", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record({ model: "gpt-4o", provider: "openai" }), new AbortController().signal);

    expect(props(calls[0])["$ai_model"]).toBe("gpt-4o");
  });

  it("strips only the FIRST slash for multi-segment model ids", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(
      record({ model: "bedrock/anthropic/claude", provider: "bedrock" }),
      new AbortController().signal
    );

    expect(props(calls[0])["$ai_model"]).toBe("anthropic/claude");
  });

  it("maps token + cost properties", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(
      record({ inputTokens: 100, outputTokens: 200, costUsd: 0.0123 }),
      new AbortController().signal
    );

    const p = props(calls[0]);
    expect(p["$ai_input_tokens"]).toBe(100);
    expect(p["$ai_output_tokens"]).toBe(200);
    expect(p["$ai_total_cost_usd"]).toBe(0.0123);
  });

  it("does NOT emit a $ai_total_tokens property (PostHog has no such field)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record({ totalTokens: 300 }), new AbortController().signal);

    expect(props(calls[0])).not.toHaveProperty("$ai_total_tokens");
  });

  it("converts $ai_latency to SECONDS (latencyMs 900 -> 0.9)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record({ latencyMs: 900 }), new AbortController().signal);

    expect(props(calls[0])["$ai_latency"]).toBe(0.9);
  });

  it("maps trace and session ids onto their own properties", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(
      record({ traceId: "trace-T", sessionId: "sess-S" }),
      new AbortController().signal
    );

    expect(props(calls[0])["$ai_trace_id"]).toBe("trace-T");
    expect(props(calls[0])["$ai_session_id"]).toBe("sess-S");
  });

  it("emits finishReason under $ai_stop_reason (NOT $ai_finish_reason) when defined", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: "stop" }), new AbortController().signal);

    const p = props(calls[0]);
    expect(p["$ai_stop_reason"]).toBe("stop");
    expect(p).not.toHaveProperty("$ai_finish_reason");
  });

  it("OMITS $ai_stop_reason entirely when finishReason is undefined", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: undefined }), new AbortController().signal);

    expect(props(calls[0])).not.toHaveProperty("$ai_stop_reason");
  });

  it("passes the AbortSignal through to fetch", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config(), fetchImpl);
    const signal = new AbortController().signal;

    await dest.send(record(), signal);

    expect(calls[0].signal).toBe(signal);
  });

  it("rejects on a non-2xx response", async () => {
    const { fetchImpl } = captureFetch(new Response(null, { status: 500 }));
    const dest = new PosthogDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow();
  });

  it("rejects on a network error", async () => {
    const fetchImpl = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    const dest = new PosthogDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow();
  });

  describe("testConnection", () => {
    it("POSTs a minimal probe event and returns ok on 2xx", async () => {
      const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
      const dest = new PosthogDestination(config({ projectApiKey: "phc_k" }), fetchImpl);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: true, status: 200 });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://us.i.posthog.com/i/v0/e/");
      expect(calls[0].method).toBe("POST");
      // The probe must NOT use $ai_generation — that would pollute LLM analytics.
      expect(calls[0].body).toEqual({
        api_key: "phc_k",
        event: "terminus_connection_test",
        distinct_id: "terminus-connection-test",
        properties: { terminus_test: true },
      });
      expect(calls[0].body.event).not.toBe("$ai_generation");
      expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    });

    it("returns ok:false with the status on a non-2xx response (never throws)", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 403 }));
      const dest = new PosthogDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });

    it("returns ok:false with an error on a network failure (never throws)", async () => {
      const fetchImpl = (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;
      const dest = new PosthogDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain("boom");
    });
  });
});

describe("PosthogDestination — SSRF guard", () => {
  it("rejects an unsafe (private) host in send() without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config({ host: "https://10.0.0.1" }), fetchImpl);
    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it("testConnection reports an unsafe host without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new PosthogDestination(config({ host: "https://169.254.169.254" }), fetchImpl);
    const result = await dest.testConnection();
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
