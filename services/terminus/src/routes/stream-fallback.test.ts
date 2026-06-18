import type { TextStreamPart, ToolSet } from "ai";
import { describe, expect, it } from "vitest";

import { type ChunkMeta, toOpenAIChatStream } from "../openai/protocol";
import { asReadable, peekStream } from "./stream-fallback";

const META: ChunkMeta = { id: "chatcmpl-1", created: 1_750_000_000, model: "anthropic/x" };

const p = (part: unknown): TextStreamPart<ToolSet> => part as TextStreamPart<ToolSet>;

const TEXT = p({ type: "text-delta", id: "t", text: "Hello" });
const TEXT2 = p({ type: "text-delta", id: "t", text: " there" });
const FINISH = p({ type: "finish", finishReason: "stop", totalUsage: {} });
const START = p({ type: "start" });
const TEXT_START = p({ type: "text-start", id: "t" });
const REASONING = p({ type: "reasoning-delta", id: "r", text: "hmm" });

/** A fake fullStream whose iterator records `return()` calls (upstream release). */
function fakeStream(parts: TextStreamPart<ToolSet>[], opts: { throwAt?: number } = {}) {
  const returns: number[] = [];
  let i = 0;
  const iterator: AsyncIterator<TextStreamPart<ToolSet>> = {
    next() {
      if (opts.throwAt === i) return Promise.reject(new Error("connect failed"));
      if (i >= parts.length) return Promise.resolve({ done: true, value: undefined });
      return Promise.resolve({ done: false, value: parts[i++] });
    },
    return() {
      returns.push(i);
      return Promise.resolve({ done: true, value: undefined });
    },
  };
  return { stream: { [Symbol.asyncIterator]: () => iterator }, returns };
}

async function collect(
  stream: AsyncIterable<TextStreamPart<ToolSet>>
): Promise<TextStreamPart<ToolSet>[]> {
  const out: TextStreamPart<ToolSet>[] = [];
  for await (const part of stream) out.push(part);
  return out;
}

describe("peekStream", () => {
  it("returns {kind:error} when the first part is an error", async () => {
    const err = new Error("boom");
    const { stream } = fakeStream([p({ type: "error", error: err })]);
    const res = await peekStream(stream);
    expect(res).toEqual({ kind: "error", error: err });
  });

  it("returns {kind:error} when the iterator throws before any part (connect error)", async () => {
    const { stream } = fakeStream([], { throwAt: 0 });
    const res = await peekStream(stream);
    expect(res.kind).toBe("error");
    expect((res as { error: Error }).error).toBeInstanceOf(Error);
  });

  it("commits on the first output part, discarding leading non-output parts (lossless from there)", async () => {
    const { stream } = fakeStream([START, TEXT_START, REASONING, TEXT, TEXT2, FINISH]);
    const res = await peekStream(stream);
    expect(res.kind).toBe("commit");
    const got = await collect((res as { stream: AsyncIterable<TextStreamPart<ToolSet>> }).stream);
    expect(got).toEqual([TEXT, TEXT2, FINISH]);
  });

  it("commits when the first output part is a tool-call", async () => {
    const tool = p({ type: "tool-call", toolCallId: "c", toolName: "fn", input: {} });
    const { stream } = fakeStream([START, tool, FINISH]);
    const res = await peekStream(stream);
    expect(res.kind).toBe("commit");
    const got = await collect((res as { stream: AsyncIterable<TextStreamPart<ToolSet>> }).stream);
    expect(got).toEqual([tool, FINISH]);
  });

  it("commits (empty) when the stream ends with no output part", async () => {
    const { stream } = fakeStream([START, TEXT_START]);
    const res = await peekStream(stream);
    expect(res.kind).toBe("commit");
    const got = await collect((res as { stream: AsyncIterable<TextStreamPart<ToolSet>> }).stream);
    expect(got).toEqual([]);
  });

  it("releases the failed candidate's iterator on a pre-commit error", async () => {
    const { stream, returns } = fakeStream([p({ type: "error", error: new Error("x") })]);
    await peekStream(stream);
    expect(returns.length).toBe(1);
  });

  it("propagates cancellation: returning the committed stream releases the upstream iterator", async () => {
    const { stream, returns } = fakeStream([TEXT, TEXT2, FINISH]);
    const res = await peekStream(stream);
    expect(res.kind).toBe("commit");
    const it = (res as { stream: AsyncIterable<TextStreamPart<ToolSet>> }).stream[
      Symbol.asyncIterator
    ]();
    const first = await it.next();
    expect(first.value).toEqual(TEXT); // re-emits the peeked part
    await it.return?.(undefined); // client disconnect mid-stream
    expect(returns.length).toBe(1); // upstream released exactly once
  });

  it("e2e: cancelling the asReadable response stream releases the upstream iterator", async () => {
    // Drives the real load-bearing chain: ReadableStream.cancel → toOpenAIChatStream
    // .return → drain.return → upstream iterator.return (the link a future refactor of
    // asReadable / toOpenAIChatStream could silently break).
    const { stream, returns } = fakeStream([TEXT, TEXT2, FINISH]);
    const peeked = await peekStream(stream);
    const sse = toOpenAIChatStream(
      (peeked as { stream: AsyncIterable<TextStreamPart<ToolSet>> }).stream,
      META
    );
    const reader = asReadable(sse).getReader();
    await reader.read(); // pull the first SSE frame (commits the chain mid-stream)
    await reader.cancel(); // client disconnect
    expect(returns.length).toBe(1); // upstream released, not abandoned
  });
});
