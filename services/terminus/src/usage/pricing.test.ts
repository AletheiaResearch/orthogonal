import { describe, expect, it } from "vitest";

import type { ModelCost } from "../catalog/registry";
import { computeCostUsd } from "./pricing";

describe("computeCostUsd", () => {
  it("prices input + output at models.dev per-1M-token rates", () => {
    const cost: ModelCost = { input: 5, output: 25 };
    const usd = computeCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost
    );
    expect(usd).toBeCloseTo(30); // 5 + 25 per 1M
  });

  it("prices cache reads and writes", () => {
    const cost: ModelCost = { input: 0, output: 0, cache_read: 0.5, cache_write: 6.25 };
    const usd = computeCostUsd(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 2_000_000, cacheWriteTokens: 1_000_000 },
      cost
    );
    expect(usd).toBeCloseTo(0.5 * 2 + 6.25 * 1); // 7.25
  });

  it("returns 0 when the model has no pricing", () => {
    const usd = computeCostUsd(
      { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      undefined
    );
    expect(usd).toBe(0);
  });

  it("treats missing price fields as 0 (partial pricing)", () => {
    const usd = computeCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { input: 2 }
    );
    expect(usd).toBeCloseTo(2); // only input priced
  });

  it("does not double-charge cached input tokens (cache is a subset of input)", () => {
    const cost: ModelCost = { input: 10, cache_read: 1 };
    const usd = computeCostUsd(
      { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 400, cacheWriteTokens: 0 },
      cost
    );
    // 600 non-cached input @ 10 + 400 cached-read @ 1, per 1M
    expect(usd).toBeCloseTo((600 * 10 + 400 * 1) / 1_000_000);
  });

  it("does not price reasoning separately (reasoning tokens are a subset of output)", () => {
    const cost: ModelCost = { input: 1, output: 1, reasoning: 100 };
    const usd = computeCostUsd(
      { inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost
    );
    expect(usd).toBeCloseTo(1); // reasoning rate ignored, no double-count
  });
});
