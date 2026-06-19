import { describe, expect, it, vi } from "vitest";

import type { UsageRecord } from "../usage/sink";
import { NoopTraceSink, parseTraceCaptureEnabled, type TraceRecord } from "./sink";

const USAGE: UsageRecord = {
  sid: "sess_1",
  tenant: null,
  model: "anthropic/claude-opus-4-5",
  inputTokens: 5,
  outputTokens: 2,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 7,
  costUsd: 0,
  createdAt: 1_750_000_000_000,
};

const TRACE: TraceRecord = {
  usage: USAGE,
  requestMessages: [{ role: "user", content: "hi" }],
  responseText: "Hello there",
  responseToolCalls: [],
  finishReason: "stop",
};

describe("NoopTraceSink", () => {
  it("records nothing and logs nothing — content is raw, unsanitized PII", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(new NoopTraceSink().record(TRACE)).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("parseTraceCaptureEnabled", () => {
  it("is on only for explicit truthy flag values", () => {
    expect(parseTraceCaptureEnabled("true")).toBe(true);
    expect(parseTraceCaptureEnabled("TRUE")).toBe(true);
    expect(parseTraceCaptureEnabled(" 1 ")).toBe(true);
  });

  it("is off by default and for any other value", () => {
    expect(parseTraceCaptureEnabled(undefined)).toBe(false);
    expect(parseTraceCaptureEnabled("")).toBe(false);
    expect(parseTraceCaptureEnabled("false")).toBe(false);
    expect(parseTraceCaptureEnabled("0")).toBe(false);
    expect(parseTraceCaptureEnabled("yes")).toBe(false);
  });
});
