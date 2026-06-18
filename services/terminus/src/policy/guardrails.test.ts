import { describe, expect, it } from "vitest";

import { parsePolicy } from "./blob";
import { applyGuardrails } from "./guardrails";

const pol = (g: object) => parsePolicy({ schemaVersion: 1, guardrails: g });

describe("applyGuardrails", () => {
  it("passes through when all gates are null/empty", () => {
    expect(applyGuardrails("openai/gpt-5", 100, pol({}))).toEqual({ maxOutputTokens: 100 });
  });

  it("403s a denied model (deny wins)", () => {
    expect(() =>
      applyGuardrails("openai/o1", undefined, pol({ deniedModels: ["openai/o1"] }))
    ).toThrow(/not allowed/);
  });

  it("deny wins even when the model is also in allowedModels", () => {
    expect(() =>
      applyGuardrails(
        "openai/o1",
        undefined,
        pol({ allowedModels: ["openai/o1"], deniedModels: ["openai/o1"] })
      )
    ).toThrow();
  });

  it("403s a model outside a non-null allowedModels", () => {
    expect(() =>
      applyGuardrails("openai/o1", undefined, pol({ allowedModels: ["openai/gpt-5"] }))
    ).toThrow();
  });

  it("allows a model inside allowedModels", () => {
    expect(
      applyGuardrails("openai/gpt-5", undefined, pol({ allowedModels: ["openai/gpt-5"] }))
    ).toEqual({ maxOutputTokens: undefined });
  });

  it("gates by provider using the first-slash split (nested ids)", () => {
    expect(() =>
      applyGuardrails(
        "openrouter/anthropic/claude",
        undefined,
        pol({ allowedProviders: ["openai"] })
      )
    ).toThrow();
    expect(
      applyGuardrails(
        "openrouter/anthropic/claude",
        undefined,
        pol({ allowedProviders: ["openrouter"] })
      )
    ).toEqual({ maxOutputTokens: undefined });
  });

  it("403s a denied provider", () => {
    expect(() =>
      applyGuardrails("codex/gpt-5-codex", undefined, pol({ deniedProviders: ["codex"] }))
    ).toThrow();
  });

  it("fails closed: an unparseable id fails a non-null allowedProviders gate", () => {
    expect(() =>
      applyGuardrails("gpt5", undefined, pol({ allowedProviders: ["openai"] }))
    ).toThrow();
  });

  it("lets an unparseable id through when no provider allow-gate is set", () => {
    // resolveModelRef will 404 it downstream; guardrails don't 403 it here.
    expect(applyGuardrails("gpt5", 50, pol({}))).toEqual({ maxOutputTokens: 50 });
  });

  it("clamps maxOutputTokens when the request exceeds the cap", () => {
    expect(applyGuardrails("openai/gpt-5", 9999, pol({ maxOutputTokensCap: 4096 }))).toEqual({
      maxOutputTokens: 4096,
    });
  });

  it("applies the cap when the client omitted max tokens", () => {
    expect(applyGuardrails("openai/gpt-5", undefined, pol({ maxOutputTokensCap: 4096 }))).toEqual({
      maxOutputTokens: 4096,
    });
  });

  it("keeps a below-cap request unchanged", () => {
    expect(applyGuardrails("openai/gpt-5", 100, pol({ maxOutputTokensCap: 4096 }))).toEqual({
      maxOutputTokens: 100,
    });
  });
});
