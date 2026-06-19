import { describe, expect, it, vi } from "vitest";

import type { BroadcastDestination } from "./destination";
import { CompositeDispatcher, shouldSample } from "./dispatcher";
import type { EmissionRecord } from "./record";

function rec(traceId = "trace-1"): EmissionRecord {
  return {
    metrics: {
      traceId,
      sessionId: "s",
      tenant: null,
      model: "anthropic/claude",
      provider: "anthropic",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      startedAtMs: 0,
      finishedAtMs: 0,
      latencyMs: 0,
      finishReason: undefined,
    },
  };
}

function fakeDest(
  opts: { id?: string; samplingRate?: number; send?: BroadcastDestination["send"] } = {}
) {
  const sends: Array<{ record: EmissionRecord; signal: AbortSignal }> = [];
  const dest: BroadcastDestination = {
    id: opts.id ?? "d1",
    type: "fake",
    samplingRate: opts.samplingRate ?? 1,
    send:
      opts.send ??
      ((record, signal) => {
        sends.push({ record, signal });
        return Promise.resolve();
      }),
    testConnection: () => Promise.resolve({ ok: true }),
  };
  return { dest, sends };
}

describe("shouldSample", () => {
  it("always samples at rate 1 and never at rate 0", () => {
    expect(shouldSample("d", "t", 1)).toBe(true);
    expect(shouldSample("d", "t", 0)).toBe(false);
  });

  it("is deterministic per (destination, trace)", () => {
    const first = shouldSample("d", "trace-xyz", 0.5);
    expect(shouldSample("d", "trace-xyz", 0.5)).toBe(first);
    expect(shouldSample("d", "trace-xyz", 0.5)).toBe(first);
  });

  it("samples independently across destinations at the same rate", () => {
    const traces = Array.from({ length: 200 }, (_, i) => `trace-${i}`);
    const a = traces.filter((t) => shouldSample("destA", t, 0.5));
    const b = traces.filter((t) => shouldSample("destB", t, 0.5));
    // Different destination ids hash to different selections of the same traces.
    expect(a).not.toEqual(b);
  });

  it("respects the rate roughly (sanity, not exact)", () => {
    const traces = Array.from({ length: 1000 }, (_, i) => `t-${i}`);
    const kept = traces.filter((t) => shouldSample("d", t, 0.3)).length;
    expect(kept).toBeGreaterThan(200);
    expect(kept).toBeLessThan(400);
  });
});

describe("CompositeDispatcher.fanOut", () => {
  it("sends to every sampled destination (rate 1)", async () => {
    const a = fakeDest({ id: "a" });
    const b = fakeDest({ id: "b" });
    const d = new CompositeDispatcher({
      resolve: () => Promise.resolve([a.dest, b.dest]),
      onError: () => {},
    });
    await d.fanOut(rec());
    expect(a.sends).toHaveLength(1);
    expect(b.sends).toHaveLength(1);
  });

  it("skips a destination whose sampling rate is 0", async () => {
    const on = fakeDest({ id: "on", samplingRate: 1 });
    const off = fakeDest({ id: "off", samplingRate: 0 });
    const d = new CompositeDispatcher({
      resolve: () => Promise.resolve([on.dest, off.dest]),
      onError: () => {},
    });
    await d.fanOut(rec());
    expect(on.sends).toHaveLength(1);
    expect(off.sends).toHaveLength(0);
  });

  it("isolates a failing destination — others still send, fanOut resolves", async () => {
    const errors: unknown[] = [];
    const boom = fakeDest({ id: "boom", send: () => Promise.reject(new Error("boom")) });
    const ok = fakeDest({ id: "ok" });
    const d = new CompositeDispatcher({
      resolve: () => Promise.resolve([boom.dest, ok.dest]),
      onError: (_dest, e) => errors.push(e),
    });
    await expect(d.fanOut(rec())).resolves.toBeUndefined();
    expect(ok.sends).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("is a no-op when no destinations are configured", async () => {
    const onError = vi.fn();
    const d = new CompositeDispatcher({ resolve: () => Promise.resolve([]), onError });
    await expect(d.fanOut(rec())).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it("hands each send a non-aborted AbortSignal", async () => {
    const a = fakeDest({ id: "a" });
    const d = new CompositeDispatcher({
      resolve: () => Promise.resolve([a.dest]),
      onError: () => {},
    });
    await d.fanOut(rec());
    expect(a.sends[0].signal).toBeInstanceOf(AbortSignal);
    expect(a.sends[0].signal.aborted).toBe(false);
  });

  it("aborts a hung send after the timeout and still resolves", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const { dest } = fakeDest({
        send: (_r, signal) =>
          new Promise<void>((_, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("aborted"));
            });
          }),
      });
      const d = new CompositeDispatcher({
        resolve: () => Promise.resolve([dest]),
        timeoutMs: 50,
        onError: () => {},
      });
      const p = d.fanOut(rec());
      await vi.advanceTimersByTimeAsync(60);
      await expect(p).resolves.toBeUndefined();
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CompositeDispatcher.dispatch", () => {
  it("returns void synchronously and schedules the fan-out into ctx.waitUntil", async () => {
    let sendDone = false;
    const { dest } = fakeDest({
      send: () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            sendDone = true;
            resolve();
          }, 5);
        }),
    });
    const scheduled: Array<Promise<unknown>> = [];
    const d = new CompositeDispatcher({
      resolve: () => Promise.resolve([dest]),
      onError: () => {},
    });

    const ret = d.dispatch(rec(), { waitUntil: (p) => scheduled.push(p) });
    expect(ret).toBeUndefined();
    expect(sendDone).toBe(false); // returned before the send completed
    expect(scheduled).toHaveLength(1);

    await scheduled[0];
    expect(sendDone).toBe(true);
  });

  it("does not throw when no execution context is provided", () => {
    const { dest } = fakeDest();
    const d = new CompositeDispatcher({
      resolve: () => Promise.resolve([dest]),
      onError: () => {},
    });
    expect(() => d.dispatch(rec(), undefined)).not.toThrow();
  });
});
