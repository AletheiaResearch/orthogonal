/**
 * Pure credential-pool selection (CON-71 L1).
 *
 * Given a provider's enabled credential rows, produce the ordered list of
 * candidates the request path should try: cooled-down rows are excluded, higher
 * `priority` tiers come first, and within a tier rows are weighted-shuffled by
 * `weight` (deterministic under an injected RNG, so it is testable). No I/O —
 * the vault supplies rows, this module only ranks them.
 */

export interface SelectableCredential {
  id: string;
  /** Higher = preferred tier (selected first). */
  priority: number;
  /** Weighted-random share within a tier; values < 1 are treated as 1. */
  weight: number;
  /** Epoch ms; while `now < cooldownUntil` the row is skipped. `null` = available. */
  cooldownUntil: number | null;
}

/** Weighted-random ordering of one priority tier (sampling without replacement). */
function weightedShuffle<T extends SelectableCredential>(tier: T[], rng: () => number): T[] {
  const pool = [...tier];
  const out: T[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, r) => sum + Math.max(1, r.weight), 0);
    let x = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      x -= Math.max(1, pool[i].weight);
      if (x <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/**
 * Ordered, cooled-down-filtered candidates: priority desc, weighted shuffle
 * within each tier. Returns a new array; never mutates the input.
 */
export function orderCandidates<T extends SelectableCredential>(
  rows: T[],
  nowMs: number,
  rng: () => number = Math.random
): T[] {
  const live = rows.filter((r) => r.cooldownUntil == null || nowMs >= r.cooldownUntil);
  const tiers = new Map<number, T[]>();
  for (const r of live) {
    const tier = tiers.get(r.priority) ?? [];
    tier.push(r);
    tiers.set(r.priority, tier);
  }
  return [...tiers.keys()]
    .toSorted((a, b) => b - a)
    .flatMap((priority) => weightedShuffle(tiers.get(priority)!, rng));
}
