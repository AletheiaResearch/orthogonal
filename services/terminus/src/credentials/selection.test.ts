import { describe, expect, it } from "vitest";

import { orderCandidates, type SelectableCredential } from "./selection";

const row = (o: Partial<SelectableCredential> & { id: string }): SelectableCredential => ({
  priority: 0,
  weight: 1,
  cooldownUntilMs: null,
  ...o,
});

describe("orderCandidates", () => {
  it("returns [] for empty input", () => {
    expect(orderCandidates([], 0)).toEqual([]);
  });

  it("excludes rows still cooling down", () => {
    const out = orderCandidates([row({ id: "a", cooldownUntilMs: 2000 }), row({ id: "b" })], 1000);
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("includes rows whose cooldown has elapsed (now >= cooldownUntilMs)", () => {
    const out = orderCandidates([row({ id: "a", cooldownUntilMs: 500 })], 1000);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("orders higher-priority tiers first", () => {
    const out = orderCandidates(
      [row({ id: "lo", priority: 0 }), row({ id: "hi", priority: 10 })],
      0
    );
    expect(out[0].id).toBe("hi");
    expect(out[1].id).toBe("lo");
  });

  it("keeps all live rows (no drops) across tiers", () => {
    const out = orderCandidates(
      [row({ id: "a", priority: 1 }), row({ id: "b", priority: 1 }), row({ id: "c", priority: 0 })],
      0
    );
    expect(out.map((r) => r.id).toSorted()).toEqual(["a", "b", "c"]);
    expect(out[2].id).toBe("c"); // lowest tier last
  });

  it("weighted shuffle within a tier is deterministic under an injected rng", () => {
    // rng=0.99 lands in the heavy-weight bucket first; the remaining single row follows.
    const seq = [0.99, 0.0];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    const out = orderCandidates([row({ id: "x", weight: 1 }), row({ id: "y", weight: 9 })], 0, rng);
    expect(out.map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("treats weight < 1 as 1 (no zero-probability starvation)", () => {
    const out = orderCandidates([row({ id: "z", weight: 0 })], 0, () => 0.5);
    expect(out.map((r) => r.id)).toEqual(["z"]);
  });
});
