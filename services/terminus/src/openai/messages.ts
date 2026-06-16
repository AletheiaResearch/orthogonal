/**
 * Convert OpenAI Chat Completions messages + tools into Vercel AI SDK inputs
 * (CON-48). Pure; unit-tested independently of any model.
 */
import { type ModelMessage, type ToolSet, jsonSchema, tool } from "ai";

import { badRequest } from "../errors";
import type { OpenAIChatMessage, OpenAIFunctionTool } from "./protocol";

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image"; image: URL | string };
type ToolCallPart = { type: "tool-call"; toolCallId: string; toolName: string; input: unknown };

function textOf(content: OpenAIChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
  }
  return "";
}

function toUrlOrString(url: string): URL | string {
  try {
    return new URL(url);
  } catch {
    return url;
  }
}

function userContent(content: OpenAIChatMessage["content"]): string | Array<TextPart | ImagePart> {
  if (content == null) return "";
  if (typeof content === "string") return content;

  const parts: Array<TextPart | ImagePart> = [];
  for (const p of content) {
    if (p.type === "text" && typeof p.text === "string") {
      parts.push({ type: "text", text: p.text });
    } else if (p.type === "image_url" && p.image_url?.url) {
      parts.push({ type: "image", image: toUrlOrString(p.image_url.url) });
    }
  }
  return parts;
}

function safeParseArgs(args: string | undefined): unknown {
  if (!args) return {};
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}

export function toModelMessages(messages: OpenAIChatMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  const toolNames = new Map<string, string>();

  for (const m of messages) {
    switch (m.role) {
      case "system":
      case "developer":
        out.push({ role: "system", content: textOf(m.content) });
        break;

      case "user":
        out.push({ role: "user", content: userContent(m.content) });
        break;

      case "assistant": {
        const text = textOf(m.content);
        const calls = m.tool_calls ?? [];
        for (const tc of calls) toolNames.set(tc.id, tc.function.name);

        if (calls.length === 0) {
          out.push({ role: "assistant", content: text });
          break;
        }

        const parts: Array<TextPart | ToolCallPart> = [];
        if (text) parts.push({ type: "text", text });
        for (const tc of calls) {
          parts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: safeParseArgs(tc.function.arguments),
          });
        }
        out.push({ role: "assistant", content: parts });
        break;
      }

      case "tool": {
        if (!m.tool_call_id) throw badRequest("tool message is missing tool_call_id");
        const toolName = toolNames.get(m.tool_call_id);
        if (!toolName) throw badRequest(`unknown tool_call_id: ${m.tool_call_id}`);
        out.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: m.tool_call_id,
              toolName,
              output: { type: "text", value: textOf(m.content) },
            },
          ],
        });
        break;
      }

      default:
        throw badRequest(`unsupported message role: ${(m as { role: string }).role}`);
    }
  }

  return out;
}

export function toToolSet(tools?: OpenAIFunctionTool[]): ToolSet | undefined {
  if (!tools?.length) return undefined;

  const set: ToolSet = {};
  for (const t of tools) {
    if (t.type !== "function") continue;
    set[t.function.name] = tool({
      description: t.function.description,
      inputSchema: jsonSchema(t.function.parameters ?? { type: "object", properties: {} }),
    });
  }

  return Object.keys(set).length > 0 ? set : undefined;
}
