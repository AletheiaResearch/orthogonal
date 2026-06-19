import { describe, expect, it } from "vitest";

import type { BroadcastDestinationRow } from "../db/schema";
import { OtlpDestination } from "./adapters/otlp";
import { PosthogDestination } from "./adapters/posthog";
import { WebhookDestination } from "./adapters/webhook";
import type { EmissionRecord } from "./record";
import { buildDestination, resolveEnabled } from "./registry";
import type { ResolvedDestinationRow } from "./store";

function row(over: Partial<ResolvedDestinationRow>): ResolvedDestinationRow {
  return {
    id: "d1",
    type: "otlp",
    label: "default",
    enabled: true,
    samplingRate: 1,
    config: {},
    secret: {},
    ...over,
  };
}

function rec(): EmissionRecord {
  return {
    metrics: {
      traceId: "a".repeat(32),
      sessionId: "s",
      tenant: null,
      model: "anthropic/claude",
      provider: "anthropic",
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.01,
      startedAtMs: 1000,
      finishedAtMs: 1900,
      latencyMs: 900,
      finishReason: "stop",
    },
  };
}

function captureFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const signal = new AbortController().signal;

describe("buildDestination", () => {
  it("builds an OTLP destination with headers taken from the encrypted secret", async () => {
    const f = captureFetch();
    const d = buildDestination(
      row({
        type: "otlp",
        config: { endpoint: "https://c.example.com" },
        secret: { headers: { authorization: "Bearer tok", "x-extra": "1" } },
      }),
      f.impl
    );
    expect(d).toBeInstanceOf(OtlpDestination);
    if (!d) throw new Error("expected a destination");
    await d.send(rec(), signal);
    expect(f.calls[0].url).toBe("https://c.example.com/v1/traces");
    const headers = f.calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["x-extra"]).toBe("1");
  });

  it("builds a PostHog destination with the project key from the secret", async () => {
    const f = captureFetch();
    const d = buildDestination(
      row({
        type: "posthog",
        config: { host: "https://eu.i.posthog.com" },
        secret: { projectApiKey: "phc_x" },
      }),
      f.impl
    );
    expect(d).toBeInstanceOf(PosthogDestination);
    if (!d) throw new Error("expected a destination");
    await d.send(rec(), signal);
    expect(f.calls[0].url).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect((JSON.parse(f.calls[0].init.body as string) as { api_key: string }).api_key).toBe(
      "phc_x"
    );
  });

  it("builds a webhook destination with url from config + hmac from secret", async () => {
    const f = captureFetch();
    const d = buildDestination(
      row({
        type: "webhook",
        config: { url: "https://hooks.example.com/x" },
        secret: { hmacKey: "k" },
      }),
      f.impl
    );
    expect(d).toBeInstanceOf(WebhookDestination);
    if (!d) throw new Error("expected a destination");
    await d.send(rec(), signal);
    expect(f.calls[0].url).toBe("https://hooks.example.com/x");
    expect((f.calls[0].init.headers as Record<string, string>)["x-terminus-signature"]).toMatch(
      /^sha256=/
    );
  });

  it("returns null for an unknown type", () => {
    expect(buildDestination(row({ type: "mystery" }))).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    expect(buildDestination(row({ type: "otlp", config: {} }))).toBeNull();
    expect(buildDestination(row({ type: "posthog", config: {}, secret: {} }))).toBeNull();
    expect(buildDestination(row({ type: "webhook", config: {} }))).toBeNull();
  });

  it("propagates the sampling rate", () => {
    const d = buildDestination(
      row({ type: "webhook", samplingRate: 0.25, config: { url: "https://hooks.example.com/x" } })
    );
    expect(d?.samplingRate).toBe(0.25);
  });
});

describe("resolveEnabled", () => {
  function rawRow(id: string): BroadcastDestinationRow {
    return {
      id,
      ownerType: "platform",
      ownerId: "",
      type: "posthog",
      enabled: true,
      samplingRate: 1,
      config: "{}",
      secretEncrypted: "ciphertext",
      label: "default",
      createdAt: 0,
      updatedAt: 0,
    };
  }

  const goodResolved = (id: string): ResolvedDestinationRow => ({
    id,
    type: "posthog",
    label: "default",
    enabled: true,
    samplingRate: 1,
    config: {},
    secret: { projectApiKey: "phc_x" },
  });

  it("skips a row whose decryption throws and keeps the healthy ones", async () => {
    const decryptRow = (r: BroadcastDestinationRow) =>
      r.id === "bad"
        ? Promise.reject(new Error("key mismatch"))
        : Promise.resolve(goodResolved(r.id));
    const dests = await resolveEnabled([rawRow("a"), rawRow("bad"), rawRow("c")], decryptRow);
    expect(dests.map((d) => d.id).sort()).toEqual(["a", "c"]);
  });

  it("skips a row that maps to an unknown type without throwing", async () => {
    const decryptRow = (r: BroadcastDestinationRow) =>
      Promise.resolve({ ...goodResolved(r.id), type: "mystery" });
    const dests = await resolveEnabled([rawRow("a")], decryptRow);
    expect(dests).toEqual([]);
  });
});
