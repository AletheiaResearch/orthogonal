import { describe, expect, it } from "vitest";

import type { EmissionMetrics, EmissionRecord } from "../record";
import type { DatadogConfig } from "./datadog";
import { DatadogDestination } from "./datadog";

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
    traceId: "0af7651916cd43dd8448eb211c80319c",
    sessionId: "sess-1",
    tenant: null,
    model: "anthropic/claude-opus-4-5",
    provider: "anthropic",
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0.0123,
    startedAtMs: 1735732800000,
    finishedAtMs: 1735732802000,
    latencyMs: 2000,
    ttftMs: 300,
    finishReason: "stop",
    ...overrides,
  };
}

function record(overrides: Partial<EmissionMetrics> = {}): EmissionRecord {
  return { metrics: metrics(overrides) };
}

function config(overrides: Partial<DatadogConfig> = {}): DatadogConfig {
  return {
    id: "dest-datadog-1",
    samplingRate: 1,
    mlApp: "terminus",
    apiKey: "dd_api_key",
    ...overrides,
  };
}

/** The single span the send() payload carries. */
const span = (call: CapturedRequest): Record<string, unknown> => {
  const data = call.body.data as Record<string, unknown>;
  const attributes = data.attributes as Record<string, unknown>;
  const spans = attributes.spans as Record<string, unknown>[];
  return spans[0];
};

/** The `attributes` envelope of a send/test payload. */
const attrs = (call: CapturedRequest): Record<string, unknown> => {
  const data = call.body.data as Record<string, unknown>;
  return data.attributes as Record<string, unknown>;
};

describe("DatadogDestination", () => {
  it("exposes id, type, and samplingRate from config", () => {
    const dest = new DatadogDestination(config({ samplingRate: 0.25 }));
    expect(dest.id).toBe("dest-datadog-1");
    expect(dest.type).toBe("datadog");
    expect(dest.samplingRate).toBe(0.25);
  });

  it("POSTs to the derived spans intake URL for the default site", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.datadoghq.com/api/intake/llm-obs/v1/trace/spans");
    expect(calls[0].method).toBe("POST");
  });

  it("derives the intake URL from a custom site", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config({ site: "datadoghq.eu" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].url).toBe("https://api.datadoghq.eu/api/intake/llm-obs/v1/trace/spans");
  });

  it("sends content-type and the raw DD-API-KEY header (NOT Bearer)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config({ apiKey: "dd_secret" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].headers).toEqual({
      "content-type": "application/json",
      "DD-API-KEY": "dd_secret",
    });
    // The key is the raw value — never an Authorization/Bearer header.
    expect(calls[0].headers).not.toHaveProperty("Authorization");
    expect(calls[0].headers).not.toHaveProperty("authorization");
    expect(calls[0].redirect).toBe("manual");
  });

  it("wraps the span in data.type=span with ml_app on the attributes envelope", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config({ mlApp: "my-ml-app" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    const data = calls[0].body.data as Record<string, unknown>;
    expect(data.type).toBe("span");
    expect(attrs(calls[0]).ml_app).toBe("my-ml-app");
  });

  it("emits model + provider tags on the attributes envelope", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(
      record({ model: "anthropic/claude-opus-4-5", provider: "anthropic" }),
      new AbortController().signal
    );

    expect(attrs(calls[0]).tags).toEqual(["model:anthropic/claude-opus-4-5", "provider:anthropic"]);
  });

  it("names the span 'chat <model>' and carries the trace id verbatim", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(span(calls[0]).name).toBe("chat anthropic/claude-opus-4-5");
    expect(span(calls[0]).trace_id).toBe("0af7651916cd43dd8448eb211c80319c");
    // Root span: parent_id is the literal "undefined" required by the LLM-Obs schema.
    expect(span(calls[0]).parent_id).toBe("undefined");
  });

  it("assigns a fresh non-empty span_id (string)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    const spanId = span(calls[0]).span_id;
    expect(typeof spanId).toBe("string");
    expect(spanId).not.toBe("");
  });

  it("encodes start_ns and duration as NANOSECOND numbers (not strings, not BigInt)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    const s = span(calls[0]);
    // start_ns = startedAtMs * 1e6 ; duration = latencyMs * 1e6 — both plain JS numbers.
    expect(typeof s.start_ns).toBe("number");
    expect(typeof s.duration).toBe("number");
    expect(s.start_ns).toBe(1735732800000 * 1e6);
    expect(s.duration).toBe(2000 * 1e6);
  });

  it("nests model_name/model_provider under meta.metadata (NOT meta.model_name)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(
      record({ model: "anthropic/claude-opus-4-5", provider: "anthropic" }),
      new AbortController().signal
    );

    const meta = span(calls[0]).meta as Record<string, unknown>;
    expect(meta.kind).toBe("llm");
    const metadata = meta.metadata as Record<string, unknown>;
    expect(metadata.model_name).toBe("anthropic/claude-opus-4-5");
    expect(metadata.model_provider).toBe("anthropic");
    expect(meta).not.toHaveProperty("model_name");
  });

  it("maps token + cost metrics onto the span", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(
      record({ inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.0123 }),
      new AbortController().signal
    );

    const m = span(calls[0]).metrics as Record<string, unknown>;
    expect(m.input_tokens).toBe(100);
    expect(m.output_tokens).toBe(50);
    expect(m.total_tokens).toBe(150);
    expect(m.total_cost).toBe(0.0123);
  });

  it("emits finish_reason as a sibling of meta.kind when finishReason is defined, keeping metadata", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: "stop" }), new AbortController().signal);

    const meta = span(calls[0]).meta as Record<string, unknown>;
    expect(meta.finish_reason).toBe("stop");
    // metadata.model_name must survive alongside finish_reason.
    const metadata = meta.metadata as Record<string, unknown>;
    expect(metadata.model_name).toBe("anthropic/claude-opus-4-5");
  });

  it("OMITS meta.finish_reason when finishReason is undefined, keeping metadata", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: undefined }), new AbortController().signal);

    const meta = span(calls[0]).meta as Record<string, unknown>;
    expect(meta).not.toHaveProperty("finish_reason");
    const metadata = meta.metadata as Record<string, unknown>;
    expect(metadata.model_name).toBe("anthropic/claude-opus-4-5");
  });

  it("builds the wire payload from metrics ONLY — never reads record.content", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    const withContent: EmissionRecord = {
      metrics: metrics(),
      content: {
        requestMessages: [{ role: "user", content: "secret prompt" }],
        responseText: "secret response",
        responseToolCalls: [],
      },
    };
    await dest.send(withContent, new AbortController().signal);

    // No PII content anywhere in the serialized body.
    const serialized = JSON.stringify(calls[0].body);
    expect(serialized).not.toContain("secret prompt");
    expect(serialized).not.toContain("secret response");
  });

  it("passes the AbortSignal through to fetch", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);
    const signal = new AbortController().signal;

    await dest.send(record(), signal);

    expect(calls[0].signal).toBe(signal);
  });

  it("resolves (does not throw) on a 202 Accepted", async () => {
    const { fetchImpl } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).resolves.toBeUndefined();
  });

  it("rejects on a non-2xx response", async () => {
    const { fetchImpl } = captureFetch(new Response(null, { status: 500 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects a non-202 2xx (strict intake contract — only 202 Accepted is success)", async () => {
    const { fetchImpl } = captureFetch(new Response(null, { status: 200 }));
    const dest = new DatadogDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/HTTP 200/);
  });

  it("rejects on a network error", async () => {
    const fetchImpl = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    const dest = new DatadogDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow();
  });

  describe("testConnection", () => {
    it("POSTs an EMPTY-spans probe and returns ok on 202", async () => {
      const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
      const dest = new DatadogDestination(config({ apiKey: "dd_k", mlApp: "app1" }), fetchImpl);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: true, status: 202 });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.datadoghq.com/api/intake/llm-obs/v1/trace/spans");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].redirect).toBe("manual");
      expect(calls[0].headers).toEqual({
        "content-type": "application/json",
        "DD-API-KEY": "dd_k",
      });
      // The probe must NOT write a synthetic span: empty spans array, and no tags.
      expect(calls[0].body).toEqual({
        data: { type: "span", attributes: { ml_app: "app1", spans: [] } },
      });
      expect(attrs(calls[0]).spans).toEqual([]);
      expect(attrs(calls[0])).not.toHaveProperty("tags");
    });

    it("returns NOT ok on a non-202 2xx (strict intake contract)", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 200 }));
      const dest = new DatadogDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(200);
    });

    it("uses fetchWithTimeout (a bounded signal, NOT the dispatcher signal)", async () => {
      const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
      const dest = new DatadogDestination(config(), fetchImpl);

      await dest.testConnection();

      expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    });

    it("returns ok:false with the status on a non-2xx response (never throws)", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 403 }));
      const dest = new DatadogDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });

    it("returns ok:false with an error on a network failure (never throws)", async () => {
      const fetchImpl = (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;
      const dest = new DatadogDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain("boom");
    });
  });
});

describe("DatadogDestination — SSRF guard", () => {
  it("rejects an unsafe (private) site in send() without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    // A site that derives to a blocked-suffix host (api.<site>).
    const dest = new DatadogDestination(config({ site: "localhost" }), fetchImpl);
    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it("testConnection reports an unsafe site without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 202 }));
    const dest = new DatadogDestination(config({ site: "internal" }), fetchImpl);
    const result = await dest.testConnection();
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
