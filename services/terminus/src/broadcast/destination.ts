/**
 * Broadcast destination interface (CON-73).
 *
 * One interface, two protocol families behind it: a shared OTLP/JSON serializer and
 * per-vendor proprietary adapters. The dispatcher (`dispatcher.ts`) treats every
 * destination uniformly — it maps the canonical `EmissionRecord` to its wire shape
 * and POSTs it. `send` MUST never throw (the dispatcher isolates failures regardless,
 * but adapters swallow their own transport errors to be safe).
 */
import type { EmissionRecord } from "./record";

/** Result of a minimal reachability+auth probe, surfaced by the admin test action. */
export interface TestConnectionResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface BroadcastDestination {
  /** Stable id (the D1 row id) — also the sampling salt. */
  readonly id: string;
  /** Adapter discriminator: "otlp" | "posthog" | "webhook" | … */
  readonly type: string;
  /** Per-trace sampling rate in [0,1]; 1 = always, 0 = never. */
  readonly samplingRate: number;
  /** Map the canonical record to this destination's wire shape and POST it. */
  send(record: EmissionRecord, signal: AbortSignal): Promise<void>;
  /** Side-effect-free reachability+auth probe for the admin "test connection" action. */
  testConnection(): Promise<TestConnectionResult>;
}
