import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  type ChunkMeta,
  mapFinishReason,
  mapUsage,
  toOpenAIChatCompletion,
  toOpenAIChatStream,
} from "./protocol";

const META: ChunkMeta = {
  id: "chatcmpl-1",
  created: 1_750_000_000,
  model: "anthropic/claude-opus-4-5",
};

function usage(partial: Partial<LanguageModelUsage>): LanguageModelUsage {
  return {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    inputTokenDetails: {},
    outputTokenDetails: {},
    ...partial,
  } as LanguageModelUsage;
}

async function* parts(...items: unknown[]): AsyncGenerator<TextStreamPart<ToolSet>> {
  for (const item of items) yield item as TextStreamPart<ToolSet>;
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const frame of gen) out.push(frame);
  return out;
}

function dataObjects(frames: string[]): Record<string, unknown>[] {
  return frames
    .filter((f) => !f.includes("[DONE]"))
    .map((f) => JSON.parse(f.replace(/^data: /, "").trim()) as Record<string, unknown>);
}

describe("mapFinishReason", () => {
  it("maps AI SDK finish reasons to OpenAI finish reasons", () => {
    expect(mapFinishReason("stop")).toBe("stop");
    expect(mapFinishReason("length")).toBe("length");
    expect(mapFinishReason("tool-calls")).toBe("tool_calls");
    expect(mapFinishReason("content-filter")).toBe("content_filter");
    expect(mapFinishReason("error")).toBe("stop");
    expect(mapFinishReason(undefined)).toBe("stop");
  });
});

describe("mapUsage", () => {
  it("maps token counts and includes cache/reasoning details when present", () => {
    const out = mapUsage(
      usage({
        inputTokens: 100,
        outputTokens: 40,
        totalTokens: 140,
        inputTokenDetails: { cacheReadTokens: 25 } as LanguageModelUsage["inputTokenDetails"],
        outputTokenDetails: { reasoningTokens: 10 } as LanguageModelUsage["outputTokenDetails"],
      })
    );

    expect(out).toEqual({
      prompt_tokens: 100,
      completion_tokens: 40,
      total_tokens: 140,
      prompt_tokens_details: { cached_tokens: 25 },
      completion_tokens_details: { reasoning_tokens: 10 },
    });
  });

  it("defaults missing token counts to 0 and omits empty details", () => {
    const out = mapUsage(usage({ inputTokens: 5, outputTokens: 3 }));
    expect(out).toEqual({ prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 });
  });
});

describe("toOpenAIChatStream", () => {
  it("streams text deltas, sends role on the first chunk, then finish + usage + [DONE]", async () => {
    const onUsage = vi.fn();
    const frames = await collect(
      toOpenAIChatStream(
        parts(
          { type: "text-delta", id: "t", text: "He" },
          { type: "text-delta", id: "t", text: "llo" },
          {
            type: "finish",
            finishReason: "stop",
            totalUsage: usage({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
          }
        ),
        META,
        onUsage
      )
    );

    expect(frames.at(-1)).toBe("data: [DONE]\n\n");
    const objs = dataObjects(frames);

    expect((objs[0].choices as { delta: Record<string, unknown> }[])[0].delta).toEqual({
      role: "assistant",
      content: "He",
    });
    expect((objs[1].choices as { delta: Record<string, unknown> }[])[0].delta).toEqual({
      content: "llo",
    });
    const finish = objs[2].choices as { finish_reason: string }[];
    expect(finish[0].finish_reason).toBe("stop");
    expect(objs[3].usage).toEqual({ prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 });
    expect(onUsage).toHaveBeenCalledOnce();
  });

  it("yields an OpenAI-style error frame and stops on a fullStream error part", async () => {
    const frames = await collect(
      toOpenAIChatStream(parts({ type: "error", error: new Error("boom") }), META)
    );

    // No trailing [DONE] after an error frame.
    expect(frames.some((f) => f.includes("[DONE]"))).toBe(false);
    const objs = dataObjects(frames);
    expect(objs).toHaveLength(1);
    const err = objs[0].error as { message: string; type: string };
    expect(err.message).toBe("boom");
    expect(err.type).toBe("api_error");
  });

  it("maps a tool-call part to an OpenAI tool_calls delta", async () => {
    const frames = await collect(
      toOpenAIChatStream(
        parts(
          { type: "tool-call", toolCallId: "call_1", toolName: "search", input: { q: "hi" } },
          {
            type: "finish",
            finishReason: "tool-calls",
            totalUsage: usage({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
          }
        ),
        META
      )
    );

    const objs = dataObjects(frames);
    const delta = (objs[0].choices as { delta: Record<string, unknown> }[])[0].delta;
    expect(delta).toEqual({
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name: "search", arguments: JSON.stringify({ q: "hi" }) },
        },
      ],
    });
  });
});

describe("toOpenAIChatCompletion", () => {
  it("builds a chat.completion with content and usage", () => {
    const body = toOpenAIChatCompletion(META, {
      content: "Hello",
      toolCalls: [],
      finishReason: "stop",
      usage: usage({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
    });

    expect(body).toMatchObject({
      object: "chat.completion",
      model: META.model,
      choices: [
        { index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });
  });

  it("includes tool_calls and null content when the model called a tool", () => {
    const body = toOpenAIChatCompletion(META, {
      content: "",
      toolCalls: [{ toolCallId: "call_1", toolName: "search", input: { q: "x" } }],
      finishReason: "tool-calls",
      usage: usage({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    });

    const choice = body.choices[0];
    expect(choice.message.content).toBeNull();
    expect(choice.finish_reason).toBe("tool_calls");
    expect(choice.message).toMatchObject({
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "search", arguments: JSON.stringify({ q: "x" }) },
        },
      ],
    });
  });
});
