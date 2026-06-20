import { describe, expect, it } from "vitest";

import type { EmissionMetrics, EmissionRecord } from "../record";
import type { S3Config } from "./s3";
import { S3Destination } from "./s3";

/** A captured outbound request, with body kept as raw bytes (S3 bodies are not JSON-only). */
interface CapturedRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  signal?: AbortSignal | null;
  redirect?: string;
  body: Uint8Array;
}

/** Normalize HeadersInit (object | Headers | entries) to a plain lowercased record. */
function toHeaderRecord(init?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  if (init instanceof Headers) {
    for (const [k, v] of init) out[k.toLowerCase()] = v;
  } else if (Array.isArray(init)) {
    for (const [k, v] of init) out[k.toLowerCase()] = v;
  } else {
    for (const [k, v] of Object.entries(init)) out[k.toLowerCase()] = v;
  }
  return out;
}

/** Coerce a fetch body (string | Uint8Array | ArrayBuffer) to bytes for inspection. */
function bodyToBytes(body: BodyInit | null | undefined): Uint8Array {
  if (body == null) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(0);
}

/** A fake `fetch` that records each request (body as bytes) and returns a fixed Response. */
function captureFetch(response: Response) {
  const calls: CapturedRequest[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: toHeaderRecord(init?.headers),
      signal: init?.signal,
      redirect: init?.redirect,
      body: bodyToBytes(init?.body),
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
    startedAtMs: 1735732800000, // 2025-01-01T00:00:00Z
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

function config(overrides: Partial<S3Config> = {}): S3Config {
  return {
    id: "dest-s3-1",
    samplingRate: 1,
    endpoint: "https://s3.us-east-1.amazonaws.com",
    bucket: "traces-bucket",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "test-secret-key",
    ...overrides,
  };
}

/** Fixed wall clock for deterministic x-amz-date signing. */
const FIXED_NOW = () => Date.parse("2025-06-20T10:00:00Z");

/** gzip files start with the magic bytes 0x1f 0x8b. */
function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

describe("S3Destination", () => {
  it("exposes id, type, and samplingRate from config", () => {
    const dest = new S3Destination(config({ samplingRate: 0.5 }));
    expect(dest.id).toBe("dest-s3-1");
    expect(dest.type).toBe("s3");
    expect(dest.samplingRate).toBe(0.5);
  });

  it("PUTs to the path-style key derived from the event-time partition", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

    await dest.send(record(), new AbortController().signal);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    // tenant null -> "_", partition from startedAtMs (2025-01-01 UTC), NOT from now().
    expect(calls[0].url).toBe(
      "https://s3.us-east-1.amazonaws.com/traces-bucket/" +
        "traces/_/2025/01/01/sess-1/0af7651916cd43dd8448eb211c80319c.json"
    );
  });

  it("uses the tenant id in the key when present", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

    await dest.send(record({ tenant: "acme" }), new AbortController().signal);

    expect(calls[0].url).toBe(
      "https://s3.us-east-1.amazonaws.com/traces-bucket/" +
        "traces/acme/2025/01/01/sess-1/0af7651916cd43dd8448eb211c80319c.json"
    );
  });

  it("prepends a configured prefix verbatim", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config({ prefix: "env/prod/" }), fetchImpl, FIXED_NOW);

    await dest.send(record(), new AbortController().signal);

    expect(calls[0].url).toBe(
      "https://s3.us-east-1.amazonaws.com/traces-bucket/" +
        "env/prod/traces/_/2025/01/01/sess-1/0af7651916cd43dd8448eb211c80319c.json"
    );
  });

  it("writes a raw JSON body of { metrics } and sets content-type, no content-encoding", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);
    const rec = record();

    await dest.send(rec, new AbortController().signal);

    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(calls[0].headers).not.toHaveProperty("content-encoding");
    expect(isGzip(calls[0].body)).toBe(false);
    // The body is the canonical record's metric subset, never content.
    const parsed = JSON.parse(new TextDecoder().decode(calls[0].body));
    expect(parsed).toEqual({ metrics: rec.metrics });
    expect(parsed).not.toHaveProperty("content");
  });

  it("gzip-compresses the body and sets content-encoding when gzip is enabled", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config({ gzip: true }), fetchImpl, FIXED_NOW);
    const rec = record();

    await dest.send(rec, new AbortController().signal);

    expect(calls[0].headers["content-encoding"]).toBe("gzip");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    // The body is actually compressed (gzip magic) and round-trips back to { metrics }.
    expect(isGzip(calls[0].body)).toBe(true);
    const inflated = await new Response(
      new Response(calls[0].body).body!.pipeThrough(new DecompressionStream("gzip"))
    ).text();
    expect(JSON.parse(inflated)).toEqual({ metrics: rec.metrics });
  });

  it("signs the PUT: Authorization, x-amz-date, x-amz-content-sha256, host headers", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

    await dest.send(record(), new AbortController().signal);

    const h = calls[0].headers;
    expect(h.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20250620\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/
    );
    expect(h["x-amz-date"]).toBe("20250620T100000Z");
    expect(h["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(h.host).toBe("s3.us-east-1.amazonaws.com");
  });

  it("the x-amz-content-sha256 matches the SHA-256 of the actual (raw) body bytes", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

    await dest.send(record(), new AbortController().signal);

    const digest = await crypto.subtle.digest("SHA-256", calls[0].body);
    let want = "";
    for (const b of new Uint8Array(digest)) want += b.toString(16).padStart(2, "0");
    expect(calls[0].headers["x-amz-content-sha256"]).toBe(want);
  });

  it("passes redirect:manual and the AbortSignal through to fetch", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);
    const signal = new AbortController().signal;

    await dest.send(record(), signal);

    expect(calls[0].redirect).toBe("manual");
    expect(calls[0].signal).toBe(signal);
  });

  it("rejects on a non-2xx response", async () => {
    const { fetchImpl } = captureFetch(new Response("AccessDenied", { status: 403 }));
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/HTTP 403/);
  });

  it("rejects on a network error", async () => {
    const fetchImpl = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow();
  });

  describe("testConnection", () => {
    it("issues a signed ListObjectsV2 GET with max-keys=0 (writes nothing)", async () => {
      const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
      const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: true, status: 200 });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe(
        "https://s3.us-east-1.amazonaws.com/traces-bucket?list-type=2&max-keys=0"
      );
      // The probe NEVER writes — no PUT, and the body is empty.
      expect(calls[0].body.length).toBe(0);
      expect(calls[0].redirect).toBe("manual");
      // Still signed.
      expect(calls[0].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
      // Empty-string payload hash for a body-less GET.
      expect(calls[0].headers["x-amz-content-sha256"]).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
    });

    it("surfaces a 403 as reachable-but-auth-rejected (ok:false, status:403)", async () => {
      const { fetchImpl } = captureFetch(new Response("AccessDenied", { status: 403 }));
      const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

      const result = await dest.testConnection();

      expect(result).toEqual({ ok: false, status: 403 });
    });

    it("returns ok:false with an error on a network failure (never throws)", async () => {
      const fetchImpl = (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;
      const dest = new S3Destination(config(), fetchImpl, FIXED_NOW);

      const result = await dest.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain("boom");
    });
  });
});

describe("S3Destination — SSRF guard", () => {
  it("rejects an unsafe (private) endpoint in send() without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(config({ endpoint: "https://10.0.0.1" }), fetchImpl, FIXED_NOW);

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it("rejects a non-https endpoint in send() (SSRF guard is https-only)", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(
      config({ endpoint: "http://s3.us-east-1.amazonaws.com" }),
      fetchImpl,
      FIXED_NOW
    );

    await expect(dest.send(record(), new AbortController().signal)).rejects.toThrow(/unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it("testConnection reports an unsafe endpoint without fetching", async () => {
    const { fetchImpl, calls } = captureFetch(new Response(null, { status: 200 }));
    const dest = new S3Destination(
      config({ endpoint: "https://169.254.169.254" }),
      fetchImpl,
      FIXED_NOW
    );

    const result = await dest.testConnection();

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
