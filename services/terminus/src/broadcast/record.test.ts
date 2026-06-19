import { describe, expect, it } from "vitest";

import type { UsageRecord } from "../usage/sink";
import { type EmissionContent, providerFromModel, toEmissionRecord } from "./record";

function usage(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    sid: "sess-1",
    tenant: null,
    model: "anthropic/claude-opus-4-5",
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: 5,
    cacheReadTokens: 3,
    cacheWriteTokens: 2,
    totalTokens: 120,
    costUsd: 0.0042,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

const timing = {
  traceId: "0123456789abcdef0123456789abcdef",
  startedAtMs: 1_700_000_000_000,
  finishedAtMs: 1_700_000_000_900,
  finishReason: "stop" as const,
};

describe("providerFromModel", () => {
  it("derives the provider from a provider-qualified model", () => {
    expect(providerFromModel("anthropic/claude-opus-4-5")).toBe("anthropic");
    expect(providerFromModel("openai/gpt-4o")).toBe("openai");
  });

  it("splits on the FIRST slash only", () => {
    expect(providerFromModel("openrouter/anthropic/claude")).toBe("openrouter");
  });

  it("returns the whole string when unqualified", () => {
    expect(providerFromModel("gpt-4o")).toBe("gpt-4o");
  });
});

describe("toEmissionRecord", () => {
  it("composes metrics from the usage record + timing (no re-derivation)", () => {
    const rec = toEmissionRecord(usage(), timing);
    expect(rec.metrics).toMatchObject({
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
      finishReason: "stop",
    });
  });

  it("carries the tenant through when set", () => {
    const rec = toEmissionRecord(usage({ tenant: "acme" }), timing);
    expect(rec.metrics.tenant).toBe("acme");
  });

  it("derives latencyMs from finished - started", () => {
    const rec = toEmissionRecord(usage(), { ...timing, startedAtMs: 1000, finishedAtMs: 1250 });
    expect(rec.metrics.latencyMs).toBe(250);
  });

  it("passes ttftMs through when provided", () => {
    const rec = toEmissionRecord(usage(), { ...timing, ttftMs: 120 });
    expect(rec.metrics.ttftMs).toBe(120);
  });

  it("leaves ttftMs undefined when absent (non-streaming)", () => {
    const rec = toEmissionRecord(usage(), timing);
    expect(rec.metrics.ttftMs).toBeUndefined();
  });

  it("preserves an undefined finish reason verbatim", () => {
    const rec = toEmissionRecord(usage(), { ...timing, finishReason: undefined });
    expect(rec.metrics.finishReason).toBeUndefined();
  });

  it("omits the content tier by default (metrics-only)", () => {
    const rec = toEmissionRecord(usage(), timing);
    expect(rec.content).toBeUndefined();
  });

  it("attaches the content tier when provided", () => {
    const content: EmissionContent = {
      requestMessages: [{ role: "user", content: "hi" }],
      responseText: "hello",
      responseToolCalls: [{ id: "call_1", name: "search", input: { q: "x" } }],
    };
    const rec = toEmissionRecord(usage(), timing, content);
    expect(rec.content).toEqual(content);
  });
});
