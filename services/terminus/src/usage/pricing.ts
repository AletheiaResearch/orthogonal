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
  // cacheRead/cacheWrite are subsets of inputTokens, so price only the non-cached
  // remainder at the input rate to avoid double-charging. Whether cache tokens are
  // truly a subset of input is provider-dependent; this is a best-effort estimate.
  const nonCachedInput = Math.max(
    0,
    tokens.inputTokens - tokens.cacheReadTokens - tokens.cacheWriteTokens
  );
  const perMillion =
    nonCachedInput * (cost.input ?? 0) +
    tokens.outputTokens * (cost.output ?? 0) +
    tokens.cacheReadTokens * (cost.cache_read ?? cost.input ?? 0) +
    tokens.cacheWriteTokens * (cost.cache_write ?? cost.input ?? 0);
  return perMillion / 1_000_000;
}
