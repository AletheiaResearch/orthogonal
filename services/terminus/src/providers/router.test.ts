import { streamText } from "ai";
import { describe, expect, it } from "vitest";

import { CODEX_BASE_URL } from "../catalog/codex";
import type { ResolvedModelRef } from "../catalog/registry";
import { buildLanguageModel, codexProviderOptions } from "./router";

function ref(
  p: Pick<ResolvedModelRef, "providerId" | "modelId" | "npm" | "credentialMode"> & {
    baseURL?: string;
  }
): ResolvedModelRef {
  return {
    providerId: p.providerId,
    modelId: p.modelId,
    npm: p.npm,
    baseURL: p.baseURL,
    envKeys: [],
    credentialMode: p.credentialMode,
    model: {
      id: p.modelId,
      name: p.modelId,
      limit: { context: 1000, output: 1000 },
      modalities: { input: ["text"], output: ["text"] },
    },
    provider: { id: p.providerId, name: p.providerId, env: [], models: {} },
  };
}

function codexRef(modelId = "gpt-5.3-codex"): ResolvedModelRef {
  return ref({
    providerId: "codex",
    modelId,
    npm: "@ai-sdk/openai",
    baseURL: CODEX_BASE_URL,
    credentialMode: "codex-oauth",
  });
}

describe("buildLanguageModel", () => {
  it("builds an Anthropic (native) model — V3, no baseURL needed", () => {
    const m = buildLanguageModel(
      ref({ providerId: "anthropic", modelId: "claude-opus-4-5", npm: "@ai-sdk/anthropic" }),
      "sk-ant"
    );
    expect(m.modelId).toBe("claude-opus-4-5");
    expect(m.specificationVersion).toBe("v3");
  });

  it("builds an OpenAI (native) model", () => {
    const m = buildLanguageModel(
      ref({ providerId: "openai", modelId: "gpt-5.4", npm: "@ai-sdk/openai" }),
      "sk-oai"
    );
    expect(m.modelId).toBe("gpt-5.4");
    expect(m.specificationVersion).toBe("v3");
  });

  it("builds an openai-compatible model from the registry baseURL", () => {
    const m = buildLanguageModel(
      ref({
        providerId: "openrouter",
        modelId: "anthropic/claude-sonnet-4.5",
        npm: "@ai-sdk/openai-compatible",
        baseURL: "https://openrouter.ai/api/v1",
      }),
      "sk-or"
    );
    expect(m.modelId).toBe("anthropic/claude-sonnet-4.5");
    expect(m.specificationVersion).toBe("v3");
  });

  it("throws when an openai-compatible provider has no baseURL", () => {
    expect(() =>
      buildLanguageModel(
        ref({ providerId: "weird", modelId: "m", npm: "@ai-sdk/openai-compatible" }),
        "k"
      )
    ).toThrow(/baseURL/i);
  });

  it("throws a 501-style error for an unsupported native adapter (e.g. google)", () => {
    expect(() =>
      buildLanguageModel(
        ref({ providerId: "google", modelId: "gemini-3", npm: "@ai-sdk/google" }),
        "k"
      )
    ).toThrow(/unsupported|adapter/i);
  });

  it("builds a Codex OAuth model via the Responses API", () => {
    const m = buildLanguageModel(codexRef("gpt-5.3-codex"), "access-token", {
      accountId: "acct-1",
      sessionId: "sess-1",
    });
    expect(m.modelId).toBe("gpt-5.3-codex");
    expect(m.specificationVersion).toBe("v3");
  });
});

// Spike (CON-50): capture the actual outgoing request the AI SDK emits for a Codex
// model and assert it matches what `chatgpt.com/backend-api/codex/responses` REQUIRES
// — the ChatGPT-backend contract (store:false, encrypted-reasoning include, the OAuth
// headers), cross-confirmed against openai/codex (Rust) + OpenCode core. This documents
// the contract and proves the router produces a compliant request; the live upstream
// call still needs a deploy-time smoke test (real Codex creds).
describe("Codex request contract (spike)", () => {
  it("POSTs codex/responses with the OAuth headers and required body deviations", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const captureFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      // We assert on the captured request, not the response; a benign body is enough.
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const model = buildLanguageModel(codexRef("gpt-5.3-codex"), "access-token", {
      accountId: "acct-1",
      sessionId: "sess-1",
      fetch: captureFetch,
    });

    const result = streamText({
      model,
      messages: [{ role: "user", content: "hi" }],
      providerOptions: codexProviderOptions("sess-1"),
    });
    try {
      for await (const _chunk of result.textStream) {
        // drain to trigger the upstream fetch
      }
    } catch {
      // the benign response is not a valid SSE stream — we only need the captured request
    }

    expect(captured).toBeDefined();
    expect(captured?.url).toBe("https://chatgpt.com/backend-api/codex/responses");

    const headers = new Headers(captured?.init.headers as HeadersInit);
    expect(headers.get("ChatGPT-Account-Id")).toBe("acct-1");
    expect(headers.get("originator")).toBe("opencode");
    expect(headers.get("session_id")).toBe("sess-1");
    expect(headers.get("Authorization")).toBe("Bearer access-token");

    const body = JSON.parse(captured?.init.body as string);
    expect(body.store).toBe(false);
    expect(body.model).toBe("gpt-5.3-codex");
    expect(body.prompt_cache_key).toBe("sess-1");
    expect(body.include).toContain("reasoning.encrypted_content");
  });
});
