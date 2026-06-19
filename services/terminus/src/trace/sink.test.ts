import type { FinishReason } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompletionParts } from "../openai/protocol";
import type { UsageRecord } from "../usage/sink";
import { NoopTraceSink, parseTraceCaptureEnabled, type TraceRecord, toTraceRecord } from "./sink";

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

const partsWith = (
  finishReason: FinishReason | undefined,
  toolCalls: CompletionParts["toolCalls"] = []
): Pick<CompletionParts, "content" | "toolCalls" | "finishReason"> => ({
  content: "hi",
  toolCalls,
  finishReason,
});

describe("toTraceRecord", () => {
  it("preserves the raw finish reason verbatim, including non-success reasons", () => {
    // The OpenAI wire format coerces these; the trace must NOT — a downstream consumer
    // (CON-43) needs to tell a failed/unknown completion from a clean stop. This is the
    // exact case the SDK test mock cannot drive (it surfaces no finish reason), so it is
    // covered here with controlled inputs.
    const reasons: FinishReason[] = [
      "error",
      "other",
      "stop",
      "length",
      "tool-calls",
      "content-filter",
    ];
    for (const r of reasons) {
      expect(toTraceRecord(USAGE, [], partsWith(r)).finishReason).toBe(r);
    }
  });

  it("preserves an absent finish reason as undefined (no coercion to 'stop')", () => {
    expect(toTraceRecord(USAGE, [], partsWith(undefined)).finishReason).toBeUndefined();
  });

  it("renames tool-call fields {toolCallId,toolName} -> {id,name} and keeps the raw input", () => {
    const rec = toTraceRecord(USAGE, [{ role: "user", content: "hi" }], {
      content: "",
      toolCalls: [{ toolCallId: "call_1", toolName: "search", input: { q: "x" } }],
      finishReason: "tool-calls",
    });
    expect(rec.responseToolCalls).toEqual([{ id: "call_1", name: "search", input: { q: "x" } }]);
  });

  it("passes usage, request messages and response text straight through", () => {
    const msgs: TraceRecord["requestMessages"] = [{ role: "user", content: "hi" }];
    const rec = toTraceRecord(USAGE, msgs, partsWith("stop"));
    expect(rec.usage).toBe(USAGE);
    expect(rec.requestMessages).toBe(msgs);
    expect(rec.responseText).toBe("hi");
  });
});

describe("NoopTraceSink", () => {
  // Restore console spies even if an assertion throws, so a mock never leaks into a
  // later test in this file.
  afterEach(() => vi.restoreAllMocks());

  it("records nothing and logs nothing — content is raw, unsanitized PII", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(new NoopTraceSink().record(TRACE)).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
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
