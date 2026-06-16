/**
 * Gateway-side cost pricing (CON-54). models.dev prices are USD per 1,000,000
 * tokens. Only the gateway holds pricing at request time, so cost is computed
 * here and emitted on the usage record.
 *
 * Reasoning tokens are a subset of output tokens in the AI SDK's usage shape, so
 * they are NOT priced separately (that would double-count). Missing price fields
 * and models without a `cost` entry (~7% of models.dev) contribute 0.
 */
import type { ModelCost } from "../catalog/registry";

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function computeCostUsd(tokens: TokenCounts, cost: ModelCost | undefined): number {
  if (!cost) return 0;
  const perMillion =
    tokens.inputTokens * (cost.input ?? 0) +
    tokens.outputTokens * (cost.output ?? 0) +
    tokens.cacheReadTokens * (cost.cache_read ?? 0) +
    tokens.cacheWriteTokens * (cost.cache_write ?? 0);
  return perMillion / 1_000_000;
}
