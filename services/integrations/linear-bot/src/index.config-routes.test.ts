import { generateInternalToken } from "@open-inspect/shared";
import { describe, expect, it } from "vitest";

import app from "./index";
import type { Env } from "./types";

const SECRET = "test-internal-secret";

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function makeEnv(): { env: Env; store: Map<string, string> } {
  const store = new Map<string, string>();
  const env = {
    INTERNAL_CALLBACK_SECRET: SECRET,
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

async function put(env: Env, path: string, body: unknown): Promise<Response> {
  const token = await generateInternalToken(SECRET);
  const req = new Request(`https://test.local${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return Promise.resolve(app.fetch(req, env, ctx));
}

// Send a raw (non-stringified) body so we can exercise the malformed-JSON path.
// The Bearer token is still valid, so the request reaches the route's JSON parse
// rather than being rejected by the auth middleware.
async function putRaw(env: Env, path: string, rawBody: string): Promise<Response> {
  const token = await generateInternalToken(SECRET);
  const req = new Request(`https://test.local${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: rawBody,
  });
  return Promise.resolve(app.fetch(req, env, ctx));
}

describe("PUT /config/* body validation", () => {
  it("stores a valid team-repos mapping", async () => {
    const { env, store } = makeEnv();
    const res = await put(env, "/config/team-repos", {
      "team-1": [{ owner: "org", name: "repo" }],
    });
    expect(res.status).toBe(200);
    expect(store.get("config:team-repos")).toBe(
      JSON.stringify({ "team-1": [{ owner: "org", name: "repo" }] })
    );
  });

  it("rejects an invalid team-repos mapping with 400 and does not persist", async () => {
    const { env, store } = makeEnv();
    const res = await put(env, "/config/team-repos", { "team-1": [{ name: "repo" }] });
    expect(res.status).toBe(400);
    expect(store.has("config:team-repos")).toBe(false);
  });

  it("rejects an invalid project-repos mapping with 400", async () => {
    const { env } = makeEnv();
    const res = await put(env, "/config/project-repos", { "proj-1": { owner: "org" } });
    expect(res.status).toBe(400);
  });

  it("stores a valid project-repos mapping", async () => {
    const { env } = makeEnv();
    const res = await put(env, "/config/project-repos", {
      "proj-1": { owner: "org", name: "repo" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid trigger config with 400", async () => {
    const { env } = makeEnv();
    const res = await put(env, "/config/triggers", { autoTriggerOnCreate: "yes" });
    expect(res.status).toBe(400);
  });

  it("accepts a partial trigger config", async () => {
    const { env } = makeEnv();
    const res = await put(env, "/config/triggers", { autoTriggerOnCreate: true });
    expect(res.status).toBe(200);
  });

  it("rejects malformed JSON on team-repos with 400 and does not persist", async () => {
    const { env, store } = makeEnv();
    const res = await putRaw(env, "/config/team-repos", "{ not valid json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(store.has("config:team-repos")).toBe(false);
  });

  it("rejects malformed JSON on triggers with 400 and does not persist", async () => {
    const { env, store } = makeEnv();
    const res = await putRaw(env, "/config/triggers", "{ not valid json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(store.has("config:triggers")).toBe(false);
  });

  it("rejects malformed JSON on project-repos with 400 and does not persist", async () => {
    const { env, store } = makeEnv();
    const res = await putRaw(env, "/config/project-repos", "{ not valid json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(store.has("config:project-repos")).toBe(false);
  });
});
