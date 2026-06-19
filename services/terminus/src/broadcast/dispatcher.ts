/**
 * Broadcast dispatcher (CON-73) — fans one canonical `EmissionRecord` out to every
 * enabled destination, fire-and-forget.
 *
 * Contract (the load-bearing safety properties):
 *  - `dispatch()` returns **void synchronously**: destination resolution (a D1 read +
 *    credential decryption) and all sends happen inside `ctx.waitUntil`, never on the
 *    response path. Nothing here can add latency to the LLM call.
 *  - Every send is isolated (`Promise.allSettled` + per-send try/catch + an
 *    `AbortController` timeout). One destination failing/timing-out can never reject
 *    the others or surface to the caller.
 *  - Sampling is deterministic per `(destination, trace)` so a trace is consistently
 *    in/out of a given destination, and destinations sample independently.
 */
import type { BroadcastDestination } from "./destination";
import type { EmissionRecord } from "./record";

/** Default per-send transport timeout (ms). */
export const DEFAULT_BROADCAST_TIMEOUT_MS = 5000;

/** FNV-1a (32-bit) of `s`, normalized to [0,1). */
function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

/**
 * Deterministic per-`(destination, trace)` sampling. Hashing the destination id AND
 * the trace id (not the trace alone) keeps destinations independent — two destinations
 * at the same rate do not select the identical set of traces.
 */
export function shouldSample(destinationId: string, traceId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return hashUnit(`${destinationId}:${traceId}`) < rate;
}

/** Minimal scheduler shape — `ExecutionContext.waitUntil`. */
export interface WaitUntilCtx {
  waitUntil(promise: Promise<unknown>): void;
}

export interface BroadcastDispatcher {
  /** Schedule the fan-out for `record`; returns immediately. */
  dispatch(record: EmissionRecord, ctx?: WaitUntilCtx): void;
}

export interface CompositeDispatcherDeps {
  /** Resolve the enabled destinations (reads D1 + decrypts creds in prod). */
  resolve: () => Promise<BroadcastDestination[]>;
  /** Per-send transport timeout (ms). */
  timeoutMs?: number;
  /** Failure hook (logging/metrics). Defaults to a structured `console.error`. */
  onError?: (destination: BroadcastDestination, error: unknown) => void;
}

export class CompositeDispatcher implements BroadcastDispatcher {
  private readonly resolve: () => Promise<BroadcastDestination[]>;
  private readonly timeoutMs: number;
  private readonly onError: (destination: BroadcastDestination, error: unknown) => void;

  constructor(deps: CompositeDispatcherDeps) {
    this.resolve = deps.resolve;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_BROADCAST_TIMEOUT_MS;
    this.onError = deps.onError ?? defaultOnError;
  }

  dispatch(record: EmissionRecord, ctx?: WaitUntilCtx): void {
    const done = this.fanOut(record);
    try {
      ctx?.waitUntil(done);
    } catch {
      // No ExecutionContext (unit tests / non-Worker runtimes); the promise still runs.
    }
  }

  /** The testable async core: resolve → sample → isolated, timed-out sends. Never rejects. */
  async fanOut(record: EmissionRecord): Promise<void> {
    let destinations: BroadcastDestination[];
    try {
      destinations = await this.resolve();
    } catch (e) {
      // Resolution itself is best-effort: a config/DB hiccup must not surface.
      defaultLog("terminus.broadcast.resolve_error", e);
      return;
    }
    const sampled = destinations.filter((d) =>
      shouldSample(d.id, record.metrics.traceId, d.samplingRate)
    );
    await Promise.allSettled(sampled.map((d) => this.sendOne(d, record)));
  }

  private async sendOne(destination: BroadcastDestination, record: EmissionRecord): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      await destination.send(record, controller.signal);
    } catch (e) {
      this.onError(destination, e);
    } finally {
      clearTimeout(timer);
    }
  }
}

function defaultOnError(destination: BroadcastDestination, error: unknown): void {
  defaultLog("terminus.broadcast.send_error", error, {
    destinationId: destination.id,
    destinationType: destination.type,
  });
}

function defaultLog(event: string, error: unknown, extra: Record<string, string> = {}): void {
  console.error(
    JSON.stringify({
      event,
      ...extra,
      message: error instanceof Error ? error.message : String(error),
    })
  );
}
