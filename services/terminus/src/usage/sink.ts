/**
 * Usage emission seam (CON-54).
 *
 * The gateway records per-call usage — tokens **and gateway-computed cost** (only
 * the gateway holds pricing at request time) — behind this interface. Attribution
 * is session-level via `sid` (the always-observable JWT claim); per-message
 * reconciliation is NOT asserted (the gateway can't observe OpenCode's message id).
 *
 * The spine ships a structured-logging sink. A **durable timeseries sink is
 * intentionally deferred** until a metrics store is chosen — the records emitted
 * here are already complete (incl. cost), so that sink just consumes them without
 * touching call sites.
 */
export interface UsageRecord {
  /** Session id from the gateway token (attribution key). */
  sid: string;
  /** Tenant id (null during single-tenant rollout). */
  tenant: string | null;
  /** Provider-qualified model id (e.g. "anthropic/claude-opus-4-5"). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  /** Gateway-priced cost in USD (0 when the model has no models.dev pricing). */
  costUsd: number;
  /** Wall-clock of the call, epoch milliseconds. */
  createdAt: number;
}

export interface UsageSink {
  record(usage: UsageRecord): Promise<void>;
}

/**
 * Default sink: emits a structured log line (the emission boundary a future
 * timeseries metrics sink consumes). Must never throw — usage is best-effort.
 */
export class LoggingUsageSink implements UsageSink {
  record(usage: UsageRecord): Promise<void> {
    console.log(JSON.stringify({ event: "terminus.usage", ...usage }));
    return Promise.resolve();
  }
}
