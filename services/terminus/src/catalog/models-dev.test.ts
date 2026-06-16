import { describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { fetchRegistry } from "./models-dev";
import type { ModelsDevRegistry } from "./registry";

const REGISTRY: ModelsDevRegistry = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    env: ["ANTHROPIC_API_KEY"],
    npm: "@ai-sdk/anthropic",
    models: {
      m: {
        id: "m",
        name: "M",
        limit: { context: 1, output: 1 },
        modalities: { input: ["text"], output: ["text"] },
      },
    },
  },
};

function fakeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    kv: {
      get: (key: string, type?: unknown) => {
        const v = store.get(key);
        if (v == null) return Promise.resolve(null);
        return Promise.resolve(type === "json" ? JSON.parse(v) : v);
      },
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
    } as unknown as KVNamespace,
  };
}

function okFetch(body: unknown) {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
}

describe("fetchRegistry", () => {
  it("fetches and returns the registry, then caches it", async () => {
    const { kv, store } = fakeKV();
    const env = { MODELS_CACHE: kv } as unknown as Env;
    const fetchImpl = okFetch(REGISTRY);

    const reg = await fetchRegistry(env, fetchImpl as unknown as typeof fetch);

    expect(reg.anthropic.name).toBe("Anthropic");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(store.size).toBeGreaterThan(0); // wrote fresh + last-good
  });

  it("returns the fresh cache without fetching", async () => {
    const { kv } = fakeKV({ "models-dev:fresh": JSON.stringify(REGISTRY) });
    const env = { MODELS_CACHE: kv } as unknown as Env;
    const fetchImpl = vi.fn();

    const reg = await fetchRegistry(env, fetchImpl as unknown as typeof fetch);

    expect(reg.anthropic.name).toBe("Anthropic");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to the last-good copy when the fetch fails", async () => {
    const { kv } = fakeKV({ "models-dev:last-good": JSON.stringify(REGISTRY) });
    const env = { MODELS_CACHE: kv } as unknown as Env;
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));

    const reg = await fetchRegistry(env, fetchImpl as unknown as typeof fetch);

    expect(reg.anthropic.name).toBe("Anthropic");
  });

  it("throws when there is no cache and the fetch fails", async () => {
    const env = {} as unknown as Env;
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));

    await expect(fetchRegistry(env, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /models\.dev/i
    );
  });

  it("serves via fetch when the KV get throws (cache failures are best-effort)", async () => {
    const kv = {
      get: () => Promise.reject(new Error("KV unavailable")),
      put: () => Promise.resolve(),
    } as unknown as KVNamespace;
    const env = { MODELS_CACHE: kv } as unknown as Env;
    const fetchImpl = okFetch(REGISTRY);

    const reg = await fetchRegistry(env, fetchImpl as unknown as typeof fetch);

    expect(reg.anthropic.name).toBe("Anthropic");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws on a non-200 response with no cache", async () => {
    const env = {} as unknown as Env;
    const fetchImpl = vi.fn(() => Promise.resolve(new Response("nope", { status: 503 })));

    await expect(fetchRegistry(env, fetchImpl as unknown as typeof fetch)).rejects.toThrow();
  });
});
