import { describe, expect, it } from "vitest";

import { toModelMessages, toToolSet } from "./messages";
import type { OpenAIChatMessage } from "./protocol";

describe("toModelMessages", () => {
  it("maps system and developer roles to a system message", () => {
    const out = toModelMessages([
      { role: "system", content: "You are helpful" },
      { role: "developer", content: "Be terse" },
    ]);
    expect(out).toEqual([
      { role: "system", content: "You are helpful" },
      { role: "system", content: "Be terse" },
    ]);
  });

  it("maps a string user message", () => {
    const out = toModelMessages([{ role: "user", content: "hi" }]);
    expect(out).toEqual([{ role: "user", content: "hi" }]);
  });

  it("maps a multi-part user message with text and an image url", () => {
    const out = toModelMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image_url", image_url: { url: "https://x/y.png" } },
        ],
      },
    ]);

    const content = out[0].content as Array<{ type: string; text?: string; image?: URL }>;
    expect(content[0]).toEqual({ type: "text", text: "look" });
    expect(content[1].type).toBe("image");
    expect((content[1].image as URL).href).toBe("https://x/y.png");
  });

  it("maps a plain assistant message to a string-content assistant message", () => {
    const out = toModelMessages([{ role: "assistant", content: "sure" }]);
    expect(out).toEqual([{ role: "assistant", content: "sure" }]);
  });

  it("maps assistant tool_calls to tool-call parts with parsed input", () => {
    const out = toModelMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "search", arguments: '{"q":"hi"}' } },
        ],
      },
    ]);

    expect(out[0]).toEqual({
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: "call_1", toolName: "search", input: { q: "hi" } },
      ],
    });
  });

  it("maps a tool result, recovering the tool name from the preceding tool call", () => {
    const conversation: OpenAIChatMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "search", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "results here" },
    ];
    const out = toModelMessages(conversation);

    expect(out[1]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_1",
          toolName: "search",
          output: { type: "text", value: "results here" },
        },
      ],
    });
  });

  it("throws a 400 for a tool message without tool_call_id", () => {
    expect(() => toModelMessages([{ role: "tool", content: "x" }])).toThrow();
  });

  it("falls back to empty input when tool-call arguments are not valid JSON", () => {
    const out = toModelMessages([
      {
        role: "assistant",
        tool_calls: [{ id: "c", type: "function", function: { name: "f", arguments: "not json" } }],
      },
    ]);
    const content = out[0].content as Array<{ input: unknown }>;
    expect(content[0].input).toEqual({});
  });
});

describe("toToolSet", () => {
  it("returns undefined for no tools", () => {
    expect(toToolSet(undefined)).toBeUndefined();
    expect(toToolSet([])).toBeUndefined();
  });

  it("builds a tool set keyed by function name", () => {
    const set = toToolSet([
      {
        type: "function",
        function: {
          name: "search",
          description: "search the web",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ]);

    expect(set).toBeDefined();
    expect(Object.keys(set ?? {})).toEqual(["search"]);
  });
});
