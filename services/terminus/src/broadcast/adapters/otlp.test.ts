import type { FinishReason } from "ai";
import { describe, expect, it } from "vitest";

import type { EmissionMetrics, EmissionRecord } from "../record";
import { OtlpDestination, type OtlpConfig } from "./otlp";

/** A captured fetch call, for asserting the exact wire request. */
interface CapturedRequest {
  url: string;
  init: RequestInit | undefined;
}

/** A fake fetch that records the request and returns a canned response. */
function recordingFetch(response: Response = new Response(null, { status: 200 })) {
  const calls: CapturedRequest[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(response);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function metrics(overrides: Partial<EmissionMetrics> = {}): EmissionMetrics {
  return {
    traceId: "0123456789abcdef0123456789abcdef",
    sessionId: "sess-1",
    tenant: null,
    model: "anthropic/claude-opus-4-5",
    provider: "anthropic",
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    reasoningTokens: 5,
    cacheReadTokens: 3,
    cacheWriteTokens: 2,
    costUsd: 0.0042,
    startedAtMs: 1_700_000_000_000,
    finishedAtMs: 1_700_000_000_900,
    latencyMs: 900,
    finishReason: "stop" as FinishReason,
    ...overrides,
  };
}

function record(overrides: Partial<EmissionMetrics> = {}): EmissionRecord {
  return { metrics: metrics(overrides) };
}

function config(overrides: Partial<OtlpConfig> = {}): OtlpConfig {
  return {
    id: "otlp-1",
    samplingRate: 1,
    endpoint: "https://collector.example.com",
    ...overrides,
  };
}

/** Parse the JSON body of the (single) captured request. */
function bodyOf(init: RequestInit | undefined): any {
  return JSON.parse(String(init?.body));
}

/** Pull the single span out of the ExportTraceServiceRequest payload. */
function spanOf(body: any): any {
  return body.resourceSpans[0].scopeSpans[0].spans[0];
}

/** Find a typed AnyValue attribute by key on a span. */
function attr(span: any, key: string): any {
  const found = span.attributes.find((a: any) => a.key === key);
  return found?.value;
}

describe("OtlpDestination identity", () => {
  it("exposes id, type, and samplingRate", () => {
    const d = new OtlpDestination(config({ id: "abc", samplingRate: 0.5 }));
    expect(d.id).toBe("abc");
    expect(d.type).toBe("otlp");
    expect(d.samplingRate).toBe(0.5);
  });
});

describe("OtlpDestination.send — URL normalization", () => {
  it("appends /v1/traces to a bare host", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config({ endpoint: "https://collector.example.com" }), fetchImpl);
    await d.send(record(), new AbortController().signal);
    expect(calls[0].url).toBe("https://collector.example.com/v1/traces");
  });

  it("strips a single trailing slash before appending /v1/traces", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(
      config({ endpoint: "https://collector.example.com/" }),
      fetchImpl
    );
    await d.send(record(), new AbortController().signal);
    expect(calls[0].url).toBe("https://collector.example.com/v1/traces");
  });

  it("leaves an endpoint that already ends with /v1/traces untouched", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(
      config({ endpoint: "https://collector.example.com/v1/traces" }),
      fetchImpl
    );
    await d.send(record(), new AbortController().signal);
    expect(calls[0].url).toBe("https://collector.example.com/v1/traces");
  });

  it("does not double-path a /v1/traces endpoint that has a trailing slash", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(
      config({ endpoint: "https://collector.example.com/v1/traces/" }),
      fetchImpl
    );
    await d.send(record(), new AbortController().signal);
    expect(calls[0].url).toBe("https://collector.example.com/v1/traces");
  });
});

describe("OtlpDestination.send — request envelope", () => {
  it("POSTs JSON with content-type and merged config headers", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(
      config({ headers: { Authorization: "Bearer tok", "x-honeycomb-team": "hc" } }),
      fetchImpl
    );
    await d.send(record(), new AbortController().signal);
    const init = calls[0].init!;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["x-honeycomb-team"]).toBe("hc");
  });

  it("forwards the AbortSignal it was handed (identity)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    const signal = new AbortController().signal;
    await d.send(record(), signal);
    expect(calls[0].init!.signal).toBe(signal);
    expect((calls[0].init as RequestInit).redirect).toBe("manual");
  });
});

describe("OtlpDestination.send — resource + scope", () => {
  it("sets service.name from config.serviceName", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config({ serviceName: "my-svc" }), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const resourceAttrs = bodyOf(calls[0].init).resourceSpans[0].resource.attributes;
    const svc = resourceAttrs.find((a: any) => a.key === "service.name");
    expect(svc.value.stringValue).toBe("my-svc");
  });

  it("defaults service.name to terminus-gateway", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const resourceAttrs = bodyOf(calls[0].init).resourceSpans[0].resource.attributes;
    const svc = resourceAttrs.find((a: any) => a.key === "service.name");
    expect(svc.value.stringValue).toBe("terminus-gateway");
  });

  it("names the scope terminus.broadcast", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    expect(bodyOf(calls[0].init).resourceSpans[0].scopeSpans[0].scope.name).toBe(
      "terminus.broadcast"
    );
  });
});

describe("OtlpDestination.send — span identity + timing (proto3 JSON encoding)", () => {
  it("carries the 32-hex trace id through unchanged", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(span.traceId).toBe("0123456789abcdef0123456789abcdef");
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates a 16-hex (8-byte) lowercase span id", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("generates a fresh span id per send (random)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    await d.send(record(), new AbortController().signal);
    const first = spanOf(bodyOf(calls[0].init)).spanId;
    const second = spanOf(bodyOf(calls[1].init)).spanId;
    expect(first).not.toBe(second);
  });

  it("names the span 'chat <model>'", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    expect(spanOf(bodyOf(calls[0].init)).name).toBe("chat anthropic/claude-opus-4-5");
  });

  it("encodes kind as the integer 3 (NOT the SPAN_KIND_CLIENT enum name)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(span.kind).toBe(3);
    expect(typeof span.kind).toBe("number");
  });

  it("encodes start/end as int64 nanosecond decimal strings (ms × 1e6)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    // A realistic epoch-ms whose ns value (~1.7e18) exceeds Number.MAX_SAFE_INTEGER.
    const startedAtMs = 1_700_000_001_234;
    const finishedAtMs = 1_700_000_002_567;
    await d.send(record({ startedAtMs, finishedAtMs }), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(span.startTimeUnixNano).toBe("1700000001234000000");
    expect(span.endTimeUnixNano).toBe("1700000002567000000");
    expect(typeof span.startTimeUnixNano).toBe("string");
  });
});

describe("OtlpDestination.send — GenAI attributes (typed AnyValue)", () => {
  it("emits provider / model as stringValue", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(attr(span, "gen_ai.provider.name")).toEqual({ stringValue: "anthropic" });
    expect(attr(span, "gen_ai.request.model")).toEqual({
      stringValue: "anthropic/claude-opus-4-5",
    });
  });

  it("emits token counts as intValue DECIMAL STRINGS (not numbers)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    const input = attr(span, "gen_ai.usage.input_tokens");
    const output = attr(span, "gen_ai.usage.output_tokens");
    expect(input).toEqual({ intValue: "100" });
    expect(output).toEqual({ intValue: "20" });
    expect(typeof input.intValue).toBe("string");
    expect(typeof output.intValue).toBe("string");
  });

  it("emits the conversation/session id as stringValue", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(attr(span, "gen_ai.conversation.id")).toEqual({ stringValue: "sess-1" });
  });

  it("emits cost as a doubleValue NUMBER (not a string)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    const cost = attr(span, "terminus.cost.usd");
    expect(cost).toEqual({ doubleValue: 0.0042 });
    expect(typeof cost.doubleValue).toBe("number");
  });
});

describe("OtlpDestination.send — finishReason handling", () => {
  it("when finishReason='stop': finish_reasons is an arrayValue, status.code=1 (ok)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record({ finishReason: "stop" as FinishReason }), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(attr(span, "gen_ai.response.finish_reasons")).toEqual({
      arrayValue: { values: [{ stringValue: "stop" }] },
    });
    expect(span.status).toEqual({ code: 1 });
  });

  it("when finishReason='error': finish_reasons present, status.code=2 (error)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record({ finishReason: "error" as FinishReason }), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(attr(span, "gen_ai.response.finish_reasons")).toEqual({
      arrayValue: { values: [{ stringValue: "error" }] },
    });
    expect(span.status).toEqual({ code: 2 });
  });

  it("when finishReason=undefined: finish_reasons attribute is ENTIRELY absent, status.code=1", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record({ finishReason: undefined }), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(attr(span, "gen_ai.response.finish_reasons")).toBeUndefined();
    expect(span.status).toEqual({ code: 1 });
  });
});

describe("OtlpDestination.send — delivery failure semantics", () => {
  it("rejects on a non-2xx response", async () => {
    const { fetchImpl } = recordingFetch(new Response(null, { status: 500 }));
    const d = new OtlpDestination(config(), fetchImpl);
    await expect(d.send(record(), new AbortController().signal)).rejects.toBeInstanceOf(Error);
  });

  it("rejects on a network error", async () => {
    const fetchImpl = (() => Promise.reject(new Error("network down"))) as typeof fetch;
    const d = new OtlpDestination(config(), fetchImpl);
    await expect(d.send(record(), new AbortController().signal)).rejects.toThrow("network down");
  });

  it("resolves on a 2xx response", async () => {
    const { fetchImpl } = recordingFetch(new Response(null, { status: 202 }));
    const d = new OtlpDestination(config(), fetchImpl);
    await expect(d.send(record(), new AbortController().signal)).resolves.toBeUndefined();
  });

  it("does not throw synchronously — always returns a promise", () => {
    const fetchImpl = (() => Promise.reject(new Error("boom"))) as typeof fetch;
    const d = new OtlpDestination(config(), fetchImpl);
    const p = d.send(record(), new AbortController().signal);
    expect(p).toBeInstanceOf(Promise);
    return p.catch(() => {});
  });
});

describe("OtlpDestination.testConnection", () => {
  it("POSTs an empty resourceSpans envelope to the normalized URL", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(
      config({ endpoint: "https://collector.example.com/" }),
      fetchImpl
    );
    await d.testConnection();
    expect(calls[0].url).toBe("https://collector.example.com/v1/traces");
    expect(calls[0].init!.method).toBe("POST");
    expect(bodyOf(calls[0].init)).toEqual({ resourceSpans: [] });
  });

  it("treats a 2xx as ok and surfaces the status", async () => {
    const { fetchImpl } = recordingFetch(new Response(null, { status: 200 }));
    const d = new OtlpDestination(config(), fetchImpl);
    expect(await d.testConnection()).toEqual({ ok: true, status: 200 });
  });

  it("treats a 400 as ok (collector reachable, payload-validation noise)", async () => {
    const { fetchImpl } = recordingFetch(new Response(null, { status: 400 }));
    const d = new OtlpDestination(config(), fetchImpl);
    expect(await d.testConnection()).toEqual({ ok: true, status: 400 });
  });

  it("treats a 500 as not ok and surfaces the status", async () => {
    const { fetchImpl } = recordingFetch(new Response(null, { status: 500 }));
    const d = new OtlpDestination(config(), fetchImpl);
    expect(await d.testConnection()).toEqual({ ok: false, status: 500 });
  });

  it("never throws on a network error — returns ok:false with the error message", async () => {
    const fetchImpl = (() => Promise.reject(new Error("unreachable"))) as typeof fetch;
    const d = new OtlpDestination(config(), fetchImpl);
    const result = await d.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unreachable");
  });
});

describe("OtlpDestination — SSRF guard + response model", () => {
  it("rejects an unsafe (private) endpoint in send() without fetching", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config({ endpoint: "https://10.0.0.1" }), fetchImpl);
    await expect(d.send(record(), new AbortController().signal)).rejects.toThrow(/unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it("testConnection reports an unsafe endpoint without fetching", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config({ endpoint: "https://169.254.169.254" }), fetchImpl);
    const result = await d.testConnection();
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("emits gen_ai.response.model alongside gen_ai.request.model", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const d = new OtlpDestination(config(), fetchImpl);
    await d.send(record(), new AbortController().signal);
    const span = spanOf(bodyOf(calls[0].init));
    expect(attr(span, "gen_ai.request.model")).toEqual({
      stringValue: "anthropic/claude-opus-4-5",
    });
    expect(attr(span, "gen_ai.response.model")).toEqual({
      stringValue: "anthropic/claude-opus-4-5",
    });
  });
});
