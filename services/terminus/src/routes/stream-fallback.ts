/**
 * Streaming-request fallback (CON-74). `streamText().fullStream` is consumed lazily,
 * after the SSE `Response` has committed — so to fall back across credential pool
 * candidates without a client-visible break, we must decide BEFORE committing.
 *
 * `peekStream` drives a candidate's stream until the first part that produces client
 * output (commit) or the first error/throw before any output (so the caller can try
 * the next candidate). Leading non-output parts (`start`, `reasoning*`, …) are
 * discarded — the OpenAI mapper ignores them anyway, so this is behavior-preserving
 * and keeps peek memory O(1). On commit the returned stream re-emits the peeked part
 * + the rest, losslessly, for `toOpenAIChatStream` to consume unchanged.
 */
import type { TextStreamPart, ToolSet } from "ai";

import { partStartsClientOutput } from "../openai/protocol";

type Part = TextStreamPart<ToolSet>;

export type PeekResult =
  | { kind: "commit"; stream: AsyncIterable<Part> }
  | { kind: "error"; error: unknown };

export async function peekStream(fullStream: AsyncIterable<Part>): Promise<PeekResult> {
  const it = fullStream[Symbol.asyncIterator]();
  for (;;) {
    let res: IteratorResult<Part>;
    try {
      res = await it.next();
    } catch (error) {
      // Connect/auth/abort error before any output: release the upstream, let the
      // caller classify (retry next candidate vs terminal).
      await safeReturn(it);
      return { kind: "error", error };
    }
    if (res.done) {
      // Ended with no output part — commit an empty stream (the mapper yields `[DONE]`).
      return { kind: "commit", stream: drain(undefined, it) };
    }
    const part = res.value;
    if (part.type === "error") {
      await safeReturn(it);
      return { kind: "error", error: part.error };
    }
    if (partStartsClientOutput(part)) {
      return { kind: "commit", stream: drain(part, it) };
    }
    // Non-output part: discard, keep peeking (no buffering).
  }
}

/**
 * Re-yield the peeked part (if any), then drain the rest of the iterator. The
 * `finally` releases the upstream iterator when the consumer stops early (client
 * disconnect → `toOpenAIChatStream`'s `for await` calls `.return()` down to here),
 * so a committed-then-cancelled stream never abandons the upstream connection.
 */
async function* drain(first: Part | undefined, it: AsyncIterator<Part>): AsyncGenerator<Part> {
  try {
    if (first !== undefined) yield first;
    for (;;) {
      const res = await it.next();
      if (res.done) return;
      yield res.value;
    }
  } finally {
    await safeReturn(it);
  }
}

/** Best-effort upstream release; never throw from cleanup. */
async function safeReturn(it: AsyncIterator<Part>): Promise<void> {
  try {
    await it.return?.();
  } catch {
    // releasing the upstream is best-effort
  }
}

/**
 * Adapt an SSE-frame async generator to a byte `ReadableStream` for the `Response`.
 * `cancel()` (client disconnect) closes the generator, which propagates down the
 * committed `drain` stream to release the upstream iterator — keeping the whole
 * cancellation chain (`cancel → toOpenAIChatStream.return → drain.return →
 * upstream.return`) load-bearing and tested.
 */
export function asReadable(gen: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await gen.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await gen.return?.(undefined);
    },
  });
}
