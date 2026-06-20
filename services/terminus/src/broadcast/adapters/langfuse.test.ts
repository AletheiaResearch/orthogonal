import { describe, expect, it } from "vitest";

import type { EmissionMetrics, EmissionRecord } from "../record";
import type { LangfuseConfig } from "./langfuse";
import { LangfuseDestination } from "./langfuse";

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
    startedAtMs: 1_735_732_800_000,
    finishedAtMs: 1_735_732_802_000,
    latencyMs: 2_000,
    ttftMs: 300,
    finishReason: "stop",
    ...overrides,
  };
}

function record(overrides: Partial<EmissionMetrics> = {}): EmissionRecord {
  return { metrics: metrics(overrides) };
}

function config(overrides: Partial<LangfuseConfig> = {}): LangfuseConfig {
  return {
    id: "dest-langfuse-1",
    samplingRate: 1,
    publicKey: "pk",
    secretKey: "sk",
    ...overrides,
  };
}

/** The two events in the ingestion batch, by their declared `type`. */
function eventsByType(call: CapturedRequest) {
  const batch = call.body.batch as Array<Record<string, unknown>>;
  const trace = batch.find((e) => e.type === "trace-create")!;
  const generation = batch.find((e) => e.type === "generation-create")!;
  return { batch, trace, generation };
}

const bodyOf = (event: Record<string, unknown>) => event.body as Record<string, unknown>;

describe("LangfuseDestination", () => {
  it("exposes id, type, and samplingRate from config", () => {
    const dest = new LangfuseDestination(config({ samplingRate: 0.25 }));
    expect(dest.id).toBe("dest-langfuse-1");
    expect(dest.type).toBe("langfuse");
    expect(dest.samplingRate).toBe(0.25);
  });

  it("POSTs to the ingestion endpoint at the default host", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://cloud.langfuse.com/api/public/ingestion");
    expect(calls[0].method).toBe("POST");
  });

  it("uses a custom host when configured", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config({ host: "https://eu.langfuse.com" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].url).toBe("https://eu.langfuse.com/api/public/ingestion");
  });

  it("strips trailing slashes from the host before appending the path", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config({ host: "https://eu.langfuse.com///" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].url).toBe("https://eu.langfuse.com/api/public/ingestion");
  });

  it("sends content-type and a Basic authorization header (no stray headers)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config({ publicKey: "pk", secretKey: "sk" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    // Exact equality catches any stray header in one shot.
    expect(calls[0].headers).toEqual({
      "content-type": "application/json",
      authorization: "Basic " + btoa("pk:sk"),
    });
    expect(calls[0].redirect).toBe("manual");
  });

  it("derives the Basic auth header from publicKey:secretKey", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(
      config({ publicKey: "pk-live-123", secretKey: "sk-live-456" }),
      fetchImpl
    );

    await dest.send(record(), new AbortController().signal);

    const headers = calls[0].headers as Record<string, string>;
    expect(headers.authorization).toBe("Basic " + btoa("pk-live-123:sk-live-456"));
  });

  it("sends a batch of exactly two events: trace-create then generation-create", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    const { batch, trace, generation } = eventsByType(calls[0]);
    expect(batch).toHaveLength(2);
    expect(trace.type).toBe("trace-create");
    expect(generation.type).toBe("generation-create");
  });

  it("builds the trace-create body: id=traceId, name, sessionId", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(
      record({ traceId: "trace-T", sessionId: "sess-S", model: "anthropic/claude-opus-4-5" }),
      new AbortController().signal
    );

    const { trace } = eventsByType(calls[0]);
    const tb = bodyOf(trace);
    expect(tb.id).toBe("trace-T");
    expect(tb.name).toBe("chat anthropic/claude-opus-4-5");
    expect(tb.sessionId).toBe("sess-S");
  });

  it("sets timestamp on both events to the finishedAt ISO string", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ finishedAtMs: 1_735_732_802_000 }), new AbortController().signal);

    const iso = new Date(1_735_732_802_000).toISOString();
    const { trace, generation } = eventsByType(calls[0]);
    expect(trace.timestamp).toBe(iso);
    expect(generation.timestamp).toBe(iso);
  });

  it("builds the generation-create body with the FULL model (no slash stripping)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ model: "anthropic/claude-opus-4-5" }), new AbortController().signal);

    const { generation } = eventsByType(calls[0]);
    const gb = bodyOf(generation);
    expect(gb.model).toBe("anthropic/claude-opus-4-5");
    expect(gb.name).toBe("chat anthropic/claude-opus-4-5");
  });

  it("links the generation to the trace via traceId", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ traceId: "trace-LINK" }), new AbortController().signal);

    const { generation } = eventsByType(calls[0]);
    expect(bodyOf(generation).traceId).toBe("trace-LINK");
  });

  it("gives the generation body a fresh UUID id that is NOT the traceId", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(
      record({ traceId: "0af7651916cd43dd8448eb211c80319c" }),
      new AbortController().signal
    );

    const { generation } = eventsByType(calls[0]);
    const gb = bodyOf(generation);
    expect(gb.id).not.toBe("0af7651916cd43dd8448eb211c80319c");
    expect(typeof gb.id).toBe("string");
    expect((gb.id as string).length).toBeGreaterThan(0);
  });

  it("gives the two event envelopes distinct ids", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    const { trace, generation } = eventsByType(calls[0]);
    expect(trace.id).not.toBe(generation.id);
    expect(typeof trace.id).toBe("string");
    expect(typeof generation.id).toBe("string");
  });

  it("sets startTime and endTime on the generation from the span timing", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(
      record({ startedAtMs: 1_735_732_800_000, finishedAtMs: 1_735_732_802_000 }),
      new AbortController().signal
    );

    const { generation } = eventsByType(calls[0]);
    const gb = bodyOf(generation);
    expect(gb.startTime).toBe(new Date(1_735_732_800_000).toISOString());
    expect(gb.endTime).toBe(new Date(1_735_732_802_000).toISOString());
  });

  it("maps usageDetails as integer token counts", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(
      record({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
      new AbortController().signal
    );

    const { generation } = eventsByType(calls[0]);
    expect(bodyOf(generation).usageDetails).toEqual({ input: 100, output: 50, total: 150 });
  });

  it("carries ONLY a total cost in costDetails (no per-direction cost)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ costUsd: 0.0123 }), new AbortController().signal);

    const { generation } = eventsByType(calls[0]);
    expect(bodyOf(generation).costDetails).toEqual({ total: 0.0123 });
  });

  it("emits finish_reason under generation metadata when finishReason is defined", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: "stop" }), new AbortController().signal);

    const { generation } = eventsByType(calls[0]);
    expect(bodyOf(generation).metadata).toEqual({ finish_reason: "stop" });
  });

  it("OMITS generation metadata entirely when finishReason is undefined", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: undefined }), new AbortController().signal);

    const { generation } = eventsByType(calls[0]);
    expect(bodyOf(generation)).not.toHaveProperty("metadata");
  });

  it("omits userId on the trace when tenant is null", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ tenant: null }), new AbortController().signal);

    const { trace } = eventsByType(calls[0]);
    expect(bodyOf(trace)).not.toHaveProperty("userId");
  });

  it("sets userId on the trace from tenant when present", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await dest.send(record({ tenant: "tenant-42" }), new AbortController().signal);

    const { trace } = eventsByType(calls[0]);
    expect(bodyOf(trace).userId).toBe("tenant-42");
  });

  it("passes the AbortSignal through to fetch", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config(), fetchImpl);
    const signal = new AbortController().signal;

    await dest.send(record(), signal);

    expect(calls[0].signal).toBe(signal);
  });

  it("treats a 207 multi-status response as success (does not throw)", async () => {
    const { fetchImpl } = captureFetch(new Response(null, { status: 207 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).resolves.toBeUndefined();
  });

  it("rejects on a non-2xx response", async () => {
    const { fetchImpl } = captureFetch(new Response(null, { status: 500 }));
    const dest = new LangfuseDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects on a network error", async () => {
    const fetchImpl = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    const dest = new LangfuseDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow();
  });

  describe("testConnection", () => {
    it("POSTs an EMPTY batch probe and returns ok on 2xx — writes no synthetic event", async () => {
      const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
      const dest = new LangfuseDestination(config({ publicKey: "pk", secretKey: "sk" }), fetchImpl);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: true, status: 200 });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://cloud.langfuse.com/api/public/ingestion");
      expect(calls[0].method).toBe("POST");
      // The probe must send an EMPTY batch — never a synthetic trace/generation.
      expect(calls[0].body).toEqual({ batch: [] });
      expect(calls[0].redirect).toBe("manual");
      const headers = calls[0].headers as Record<string, string>;
      expect(headers.authorization).toBe("Basic " + btoa("pk:sk"));
      expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    });

    it("treats a 207 multi-status probe response as ok", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 207 }));
      const dest = new LangfuseDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(true);
      expect(result.status).toBe(207);
    });

    it("returns ok:false with the status on a non-2xx response (never throws)", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 401 }));
      const dest = new LangfuseDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it("returns ok:false with an error on a network failure (never throws)", async () => {
      const fetchImpl = (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;
      const dest = new LangfuseDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain("boom");
    });
  });
});

describe("LangfuseDestination — SSRF guard", () => {
  it("rejects an unsafe (private) host in send() without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config({ host: "https://10.0.0.1" }), fetchImpl);
    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it("testConnection reports an unsafe host without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangfuseDestination(config({ host: "https://169.254.169.254" }), fetchImpl);
    const result = await dest.testConnection();
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
