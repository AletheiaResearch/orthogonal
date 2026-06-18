import { describe, expect, it } from "vitest";

import { parsePolicy } from "./blob";

describe("parsePolicy", () => {
  it("accepts a minimal blob and applies defaults", () => {
    const p = parsePolicy({ schemaVersion: 1, guardrails: {} });
    expect(p.guardrails.allowedModels).toBeNull();
    expect(p.guardrails.deniedModels).toEqual([]);
    expect(p.guardrails.allowedProviders).toBeNull();
    expect(p.guardrails.deniedProviders).toEqual([]);
    expect(p.guardrails.maxOutputTokensCap).toBeNull();
    expect(p.credentialScope).toBe("platform");
    expect(p.byokServiceFeeBps).toBeNull();
  });

  it("accepts a blob with no guardrails object (full defaults)", () => {
    const p = parsePolicy({ schemaVersion: 1 });
    expect(p.guardrails.deniedModels).toEqual([]);
    expect(p.credentialScope).toBe("platform");
  });

  it("round-trips fully-specified fields incl. dormant ones", () => {
    const p = parsePolicy({
      schemaVersion: 1,
      guardrails: {
        allowedModels: ["openai/gpt-5"],
        deniedModels: ["openai/o1"],
        allowedProviders: ["openai", "anthropic"],
        deniedProviders: ["codex"],
        maxOutputTokensCap: 4096,
      },
      credentialScope: "both",
      byokServiceFeeBps: 500,
    });
    expect(p.guardrails.allowedModels).toEqual(["openai/gpt-5"]);
    expect(p.guardrails.deniedModels).toEqual(["openai/o1"]);
    expect(p.guardrails.allowedProviders).toEqual(["openai", "anthropic"]);
    expect(p.guardrails.deniedProviders).toEqual(["codex"]);
    expect(p.guardrails.maxOutputTokensCap).toBe(4096);
    expect(p.credentialScope).toBe("both");
    expect(p.byokServiceFeeBps).toBe(500);
  });

  it("accepts an explicit null cap and null fee", () => {
    const p = parsePolicy({
      schemaVersion: 1,
      guardrails: { maxOutputTokensCap: null },
      byokServiceFeeBps: null,
    });
    expect(p.guardrails.maxOutputTokensCap).toBeNull();
    expect(p.byokServiceFeeBps).toBeNull();
  });

  it.each([
    ["wrong schemaVersion", { schemaVersion: 2, guardrails: {} }],
    ["missing schemaVersion", { guardrails: {} }],
    ["non-object", "nope"],
    ["null", null],
    ["guardrails not object", { schemaVersion: 1, guardrails: [] }],
    ["deniedModels not array", { schemaVersion: 1, guardrails: { deniedModels: "x" } }],
    ["allowedModels not string[]", { schemaVersion: 1, guardrails: { allowedModels: [1] } }],
    [
      "allowedProviders not string[]",
      { schemaVersion: 1, guardrails: { allowedProviders: [true] } },
    ],
    ["bad credentialScope", { schemaVersion: 1, guardrails: {}, credentialScope: "free" }],
    ["non-int cap", { schemaVersion: 1, guardrails: { maxOutputTokensCap: 1.5 } }],
    ["negative cap", { schemaVersion: 1, guardrails: { maxOutputTokensCap: -1 } }],
    ["zero cap", { schemaVersion: 1, guardrails: { maxOutputTokensCap: 0 } }],
    ["non-int fee", { schemaVersion: 1, guardrails: {}, byokServiceFeeBps: "5%" }],
    ["negative fee", { schemaVersion: 1, guardrails: {}, byokServiceFeeBps: -1 }],
  ])("rejects %s", (_label, raw) => {
    expect(() => parsePolicy(raw)).toThrow();
  });
});
