/**
 * Usage emission seam (CON-54).
 *
 * The gateway records per-call usage behind this interface. The spine ships a
 * logging no-op; CON-54 replaces it with a durable, spin-out-ready sink (a D1
 * ledger / queue) without touching call sites. Attribution is session-level via
 * `sid` (the always-observable JWT claim) — per-message reconciliation is NOT
 * asserted (see the CON-54 design notes).
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
  /** Wall-clock of the call, epoch milliseconds. */
  createdAt: number;
}

export interface UsageSink {
  record(usage: UsageRecord): Promise<void>;
}

/** Default sink: emits a structured log line. Replaced by the durable sink in CON-54. */
export class LoggingUsageSink implements UsageSink {
  record(usage: UsageRecord): Promise<void> {
    console.log(JSON.stringify({ event: "terminus.usage", ...usage }));
    return Promise.resolve();
  }
}
