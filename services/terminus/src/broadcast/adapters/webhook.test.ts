import { describe, expect, it } from "vitest";

import { hmacSha256Hex } from "../hmac";
import type { EmissionRecord } from "../record";
import { WebhookDestination } from "./webhook";

/** A canonical record with a concrete finishReason so the body round-trips exactly. */
function rec(traceId = "trace-1"): EmissionRecord {
  return {
    metrics: {
      traceId,
      sessionId: "sess-1",
      tenant: null,
      model: "anthropic/claude-opus-4-5",
      provider: "anthropic",
      inputTokens: 11,
      outputTokens: 22,
      totalTokens: 33,
      reasoningTokens: 3,
      cacheReadTokens: 4,
      cacheWriteTokens: 5,
      costUsd: 0.0123,
      startedAtMs: 1000,
      finishedAtMs: 1500,
      latencyMs: 500,
      ttftMs: 120,
      finishReason: "stop",
    },
  };
}

/** Captures the single request a fetch-driven adapter makes. */
interface Captured {
  url?: string;
  init?: RequestInit;
  calls: number;
}

function recordingFetch(status = 200): { fetchImpl: typeof fetch; captured: Captured } {
  const captured: Captured = { calls: 0 };
  const fetchImpl: typeof fetch = async (url, init) => {
    captured.calls += 1;
    captured.url = String(url);
    captured.init = init;
    return new Response(null, { status });
  };
  return { fetchImpl, captured };
}

const SAFE_URL = "https://hooks.example.com/ingest";

describe("WebhookDestination — identity", () => {
  it("exposes id, type 'webhook', and the configured samplingRate", () => {
    const { fetchImpl } = recordingFetch();
    const dest = new WebhookDestination(
      { id: "wh-1", samplingRate: 0.5, url: SAFE_URL },
      fetchImpl
    );
    expect(dest.id).toBe("wh-1");
    expect(dest.type).toBe("webhook");
    expect(dest.samplingRate).toBe(0.5);
  });
});

describe("WebhookDestination.send — wire shape", () => {
  it("POSTs JSON.stringify(record.metrics) to the configured url with the signal", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const dest = new WebhookDestination({ id: "wh", samplingRate: 1, url: SAFE_URL }, fetchImpl);
    const signal = new AbortController().signal;
    const record = rec();

    await dest.send(record, signal);

    expect(captured.calls).toBe(1);
    expect(captured.url).toBe(SAFE_URL);
    expect(captured.init?.method).toBe("POST");
    expect(captured.init?.signal).toBe(signal);
    expect((captured.init as RequestInit).redirect).toBe("manual");

    const headers = captured.init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");

    // Body is the metric subset, exactly — round-trips to record.metrics.
    expect(typeof captured.init?.body).toBe("string");
    expect(JSON.parse(captured.init?.body as string)).toEqual(record.metrics);
  });

  it("merges custom config.headers (without dropping content-type)", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const dest = new WebhookDestination(
      { id: "wh", samplingRate: 1, url: SAFE_URL, headers: { "x-team": "platform" } },
      fetchImpl
    );
    await dest.send(rec(), new AbortController().signal);

    const headers = captured.init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-team"]).toBe("platform");
  });

  it("signs the exact bytes it sends with x-terminus-signature when hmacKey is set", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const key = "shhh-secret";
    const dest = new WebhookDestination(
      { id: "wh", samplingRate: 1, url: SAFE_URL, hmacKey: key },
      fetchImpl
    );
    await dest.send(rec(), new AbortController().signal);

    const headers = captured.init?.headers as Record<string, string>;
    const sentBody = captured.init?.body as string;
    // Sign the captured body, not a re-stringified copy — proves the impl signs what it sends.
    const expectedSig = await hmacSha256Hex(key, sentBody);
    expect(headers["x-terminus-signature"]).toBe(`sha256=${expectedSig}`);
  });

  it("omits x-terminus-signature when no hmacKey is configured", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const dest = new WebhookDestination({ id: "wh", samplingRate: 1, url: SAFE_URL }, fetchImpl);
    await dest.send(rec(), new AbortController().signal);

    const headers = captured.init?.headers as Record<string, string>;
    expect(headers["x-terminus-signature"]).toBeUndefined();
  });
});

describe("WebhookDestination.send — SSRF guard", () => {
  it("rejects a private-range https url and never calls fetch", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const dest = new WebhookDestination(
      { id: "wh", samplingRate: 1, url: "https://10.0.0.1/x" },
      fetchImpl
    );
    await expect(dest.send(rec(), new AbortController().signal)).rejects.toThrow(
      /unsafe webhook url/
    );
    expect(captured.calls).toBe(0);
  });

  it("rejects a non-https url and never calls fetch", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const dest = new WebhookDestination(
      { id: "wh", samplingRate: 1, url: "http://example.com" },
      fetchImpl
    );
    await expect(dest.send(rec(), new AbortController().signal)).rejects.toThrow(
      /unsafe webhook url/
    );
    expect(captured.calls).toBe(0);
  });
});

describe("WebhookDestination.send — delivery failures reject", () => {
  it("rejects on a non-2xx response", async () => {
    const { fetchImpl } = recordingFetch(500);
    const dest = new WebhookDestination({ id: "wh", samplingRate: 1, url: SAFE_URL }, fetchImpl);
    await expect(dest.send(rec(), new AbortController().signal)).rejects.toThrow();
  });

  it("rejects on a network error", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("network down");
    };
    const dest = new WebhookDestination({ id: "wh", samplingRate: 1, url: SAFE_URL }, fetchImpl);
    await expect(dest.send(rec(), new AbortController().signal)).rejects.toThrow(/network down/);
  });
});

describe("WebhookDestination.testConnection", () => {
  it("posts a tiny mock body and returns ok:true with status on 2xx", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const dest = new WebhookDestination({ id: "wh", samplingRate: 1, url: SAFE_URL }, fetchImpl);

    const result = await dest.testConnection();

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(captured.calls).toBe(1);
    expect(captured.url).toBe(SAFE_URL);
    expect(captured.init?.method).toBe("POST");
    expect(JSON.parse(captured.init?.body as string)).toEqual({ test: true });
    expect(captured.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("signs the probe body when hmacKey is set", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const key = "probe-key";
    const dest = new WebhookDestination(
      { id: "wh", samplingRate: 1, url: SAFE_URL, hmacKey: key },
      fetchImpl
    );
    await dest.testConnection();

    const headers = captured.init?.headers as Record<string, string>;
    const sentBody = captured.init?.body as string;
    const expectedSig = await hmacSha256Hex(key, sentBody);
    expect(headers["x-terminus-signature"]).toBe(`sha256=${expectedSig}`);
  });

  it("returns ok:false with the status on a non-2xx response", async () => {
    const { fetchImpl } = recordingFetch(403);
    const dest = new WebhookDestination({ id: "wh", samplingRate: 1, url: SAFE_URL }, fetchImpl);
    const result = await dest.testConnection();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it("returns ok:false with the SSRF reason and never calls fetch for an unsafe url", async () => {
    const { fetchImpl, captured } = recordingFetch(200);
    const dest = new WebhookDestination(
      { id: "wh", samplingRate: 1, url: "https://localhost/x" },
      fetchImpl
    );
    const result = await dest.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(captured.calls).toBe(0);
  });

  it("never throws on a network error — returns ok:false with error", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("boom");
    };
    const dest = new WebhookDestination({ id: "wh", samplingRate: 1, url: SAFE_URL }, fetchImpl);
    const result = await dest.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
  });
});
