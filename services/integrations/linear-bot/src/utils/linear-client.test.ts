import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../types";
import {
  buildOAuthAuthorizeUrl,
  consumeOAuthState,
  createOAuthState,
  fetchUser,
} from "./linear-client";
import type { LinearApiClient } from "./linear-client";

const client: LinearApiClient = { accessToken: "test-token" };

function mockFetchResponse(data: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    })
  );
}

describe("fetchUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns user with name and email", async () => {
    mockFetchResponse({
      data: {
        user: { id: "user-1", name: "Alice", email: "alice@example.com" },
      },
    });

    const result = await fetchUser(client, "user-1");
    expect(result).toEqual({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("returns null email when user has no email", async () => {
    mockFetchResponse({
      data: {
        user: { id: "user-2", name: "Bob", email: null },
      },
    });

    const result = await fetchUser(client, "user-2");
    expect(result).toEqual({
      id: "user-2",
      name: "Bob",
      email: null,
    });
  });

  it("returns null when user is not found", async () => {
    mockFetchResponse({ data: { user: null } });

    const result = await fetchUser(client, "nonexistent");
    expect(result).toBeNull();
  });

  it("returns null on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    const result = await fetchUser(client, "user-1");
    expect(result).toBeNull();
  });

  it("returns null on GraphQL errors payload", async () => {
    mockFetchResponse({
      data: null,
      errors: [{ message: "Not authorized" }],
    });

    const result = await fetchUser(client, "user-1");
    expect(result).toBeNull();
  });
});

// ─── OAuth CSRF state ─────────────────────────────────────────────────────────

function makeKvMockEnv(): { env: Env; store: Map<string, string> } {
  const store = new Map<string, string>();
  const env = {
    LINEAR_CLIENT_ID: "client-123",
    WORKER_URL: "https://worker.example",
    LINEAR_KV: {
      get: (key: string) => Promise.resolve(store.has(key) ? store.get(key)! : null),
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      delete: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
    },
  } as unknown as Env;
  return { env, store };
}

describe("buildOAuthAuthorizeUrl", () => {
  it("includes the CSRF state parameter", () => {
    const env = { LINEAR_CLIENT_ID: "client-123", WORKER_URL: "https://worker.example" } as Env;
    const url = new URL(buildOAuthAuthorizeUrl(env, "state-abc"));
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://worker.example/oauth/callback");
  });
});

describe("createOAuthState / consumeOAuthState", () => {
  it("a state created via createOAuthState is consumable exactly once", async () => {
    const { env } = makeKvMockEnv();
    const state = await createOAuthState(env);
    expect(state).toBeTruthy();

    expect(await consumeOAuthState(env, state)).toBe(true);
    // Single-use: a replay of the same state is rejected.
    expect(await consumeOAuthState(env, state)).toBe(false);
  });

  it("persists the state under the oauth:state: prefix with a TTL", async () => {
    const { env, store } = makeKvMockEnv();
    const state = await createOAuthState(env);
    expect(store.has(`oauth:state:${state}`)).toBe(true);
  });

  it("rejects a null state (missing query param)", async () => {
    const { env } = makeKvMockEnv();
    expect(await consumeOAuthState(env, null)).toBe(false);
  });

  it("rejects a state that was never issued (forged callback)", async () => {
    const { env } = makeKvMockEnv();
    expect(await consumeOAuthState(env, "forged-state")).toBe(false);
  });
});
