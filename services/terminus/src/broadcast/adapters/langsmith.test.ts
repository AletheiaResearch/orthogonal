import { describe, expect, it } from "vitest";

import type { EmissionMetrics, EmissionRecord } from "../record";
import type { LangsmithConfig } from "./langsmith";
import { LangsmithDestination } from "./langsmith";

/** A captured outbound request, with the body parsed back from its JSON string. */
interface CapturedRequest {
  url: string;
  method?: string;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
  redirect?: string;
  body: Record<string, unknown>;
}

/** One LangSmith run object (the element of the `post` batch). */
type LangsmithRun = Record<string, unknown>;

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

function config(overrides: Partial<LangsmithConfig> = {}): LangsmithConfig {
  return {
    id: "dest-langsmith-1",
    samplingRate: 1,
    apiKey: "ls_api_key",
    ...overrides,
  };
}

/** Pull the single run object out of the captured `{ post: [run] }` batch body. */
const run = (call: CapturedRequest): LangsmithRun => (call.body.post as LangsmithRun[])[0];

/** The `extra.metadata` object on a run. */
const metadata = (r: LangsmithRun): Record<string, unknown> =>
  (r.extra as { metadata: Record<string, unknown> }).metadata;

describe("LangsmithDestination", () => {
  it("exposes id, type, and samplingRate from config", () => {
    const dest = new LangsmithDestination(config({ samplingRate: 0.25 }));
    expect(dest.id).toBe("dest-langsmith-1");
    expect(dest.type).toBe("langsmith");
    expect(dest.samplingRate).toBe(0.25);
  });

  it("POSTs to the batch endpoint at the default host", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.smith.langchain.com/api/v1/runs/batch");
    expect(calls[0].method).toBe("POST");
  });

  it("uses a custom endpoint when configured, stripping trailing slashes", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(
      config({ endpoint: "https://eu.api.smith.langchain.com///" }),
      fetchImpl
    );

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].url).toBe("https://eu.api.smith.langchain.com/api/v1/runs/batch");
  });

  it("authenticates with an x-api-key header, NOT Authorization/Bearer", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config({ apiKey: "ls_secret" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "ls_secret",
    });
    expect(calls[0].headers).not.toHaveProperty("Authorization");
    expect(calls[0].headers).not.toHaveProperty("authorization");
  });

  it("sets redirect:manual (SSRF redirect-bypass guard)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].redirect).toBe("manual");
  });

  it("wraps the run in a { post: [run] } batch envelope", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(Array.isArray(calls[0].body.post)).toBe(true);
    expect((calls[0].body.post as unknown[]).length).toBe(1);
  });

  it("sets trace_id equal to the run id (standalone run)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    const r = run(calls[0]);
    expect(typeof r.id).toBe("string");
    expect(r.trace_id).toBe(r.id);
  });

  it("builds dotted_order as the UTC-strftime timestamp immediately followed by the id", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    // startedAtMs 1735732800000 = 2025-01-01T12:00:00.000Z.
    await dest.send(record(), new AbortController().signal);

    const r = run(calls[0]);
    // Full string pinned — the microsecond padding (mmm + "000") is the load-bearing part.
    expect(r.dotted_order).toBe("20250101T120000000000Z" + (r.id as string));
    expect(r.dotted_order as string).toMatch(/^20250101T/);
    expect((r.dotted_order as string).endsWith(r.id as string)).toBe(true);
  });

  it("pads sub-second ms into the LEADING microsecond digits (123ms -> 123000us)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    // startedAtMs 1735732800123 = 2025-01-01T12:00:00.123Z. The 3 ms digits must LEAD the
    // 6-digit micro field (123000), not trail it (000123) — that's the ordering invariant.
    await dest.send(record({ startedAtMs: 1735732800123 }), new AbortController().signal);

    const r = run(calls[0]);
    expect(r.dotted_order).toBe("20250101T120000123000Z" + (r.id as string));
  });

  it("names the run `chat <model>` (full model, no prefix stripping) with run_type llm", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record({ model: "anthropic/claude-opus-4-5" }), new AbortController().signal);

    const r = run(calls[0]);
    expect(r.name).toBe("chat anthropic/claude-opus-4-5");
    expect(r.run_type).toBe("llm");
  });

  it("emits ISO-8601 start_time and end_time", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    const r = run(calls[0]);
    expect(r.start_time).toBe("2025-01-01T12:00:00.000Z");
    expect(r.end_time).toBe("2025-01-01T12:00:02.000Z");
  });

  it("carries ls_model_name + ls_provider (full model) and metrics in extra.metadata", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(
      record({
        model: "anthropic/claude-opus-4-5",
        provider: "anthropic",
        sessionId: "sess-XYZ",
        costUsd: 0.0123,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      }),
      new AbortController().signal
    );

    const md = metadata(run(calls[0]));
    expect(md.ls_model_name).toBe("anthropic/claude-opus-4-5");
    expect(md.ls_provider).toBe("anthropic");
    expect(md.session_id).toBe("sess-XYZ");
    expect(md.terminus_cost_usd).toBe(0.0123);
    expect(md.input_tokens).toBe(100);
    expect(md.output_tokens).toBe(50);
    expect(md.total_tokens).toBe(150);
  });

  it("includes session_name only when projectName is set", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config({ projectName: "my-project" }), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(run(calls[0]).session_name).toBe("my-project");
  });

  it("OMITS session_name entirely when projectName is unset", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(run(calls[0])).not.toHaveProperty("session_name");
  });

  it("puts finishReason under outputs.finish_reason (NOT metadata) when present", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: "stop" }), new AbortController().signal);

    const r = run(calls[0]);
    expect((r.outputs as Record<string, unknown>).finish_reason).toBe("stop");
    expect(metadata(r)).not.toHaveProperty("finish_reason");
  });

  it("OMITS outputs entirely when finishReason is undefined", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record({ finishReason: undefined }), new AbortController().signal);

    expect(run(calls[0])).not.toHaveProperty("outputs");
  });

  it("NEVER emits an inputs field (metrics-only — content is gated off)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await dest.send(record(), new AbortController().signal);

    expect(run(calls[0])).not.toHaveProperty("inputs");
  });

  it("passes the AbortSignal through to fetch", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config(), fetchImpl);
    const signal = new AbortController().signal;

    await dest.send(record(), signal);

    expect(calls[0].signal).toBe(signal);
  });

  it("rejects on a non-2xx response", async () => {
    const { fetchImpl } = captureFetch(new Response(null, { status: 500 }));
    const dest = new LangsmithDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects on a network error", async () => {
    const fetchImpl = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    const dest = new LangsmithDestination(config(), fetchImpl);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow();
  });

  describe("testConnection", () => {
    it("POSTs an EMPTY batch (no synthetic run) and returns ok on 2xx", async () => {
      const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
      const dest = new LangsmithDestination(config({ apiKey: "ls_k" }), fetchImpl);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: true, status: 200 });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.smith.langchain.com/api/v1/runs/batch");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].redirect).toBe("manual");
      // The probe must be side-effect-free: an EMPTY batch, never a real run.
      expect(calls[0].body).toEqual({ post: [] });
      expect((calls[0].body.post as unknown[]).length).toBe(0);
      expect((calls[0].headers as Record<string, string>)["x-api-key"]).toBe("ls_k");
      expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    });

    it("treats a 400 (reachable, validation rejected) as ok", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 400 }));
      const dest = new LangsmithDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: true, status: 400 });
    });

    it("treats a 422 (reachable, validation rejected) as ok", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 422 }));
      const dest = new LangsmithDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: true, status: 422 });
    });

    it("returns ok:false with the status on an auth failure (401, never throws)", async () => {
      const { fetchImpl } = captureFetch(new Response(null, { status: 401 }));
      const dest = new LangsmithDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it("returns ok:false with an error on a network failure (never throws)", async () => {
      const fetchImpl = (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;
      const dest = new LangsmithDestination(config(), fetchImpl);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain("boom");
    });
  });
});

describe("LangsmithDestination — SSRF guard", () => {
  it("rejects an unsafe (private) endpoint in send() without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(config({ endpoint: "https://10.0.0.1" }), fetchImpl);
    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it("testConnection reports an unsafe endpoint without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new LangsmithDestination(
      config({ endpoint: "https://169.254.169.254" }),
      fetchImpl
    );
    const result = await dest.testConnection();
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
