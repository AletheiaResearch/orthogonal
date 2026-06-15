import { computeHmacHex } from "@open-inspect/shared";
import { describe, expect, it } from "vitest";

import {
  CALLBACK_TIMESTAMP_VALIDITY_MS,
  callbacksRouter,
  verifyCallbackSignature,
} from "./callbacks";
import type { Env } from "./types";

const SECRET = "test-callback-secret";

// Minimal env: the stale-timestamp path short-circuits before any KV / fetch use.
const env = { INTERNAL_CALLBACK_SECRET: SECRET } as unknown as Env;

/**
 * Sign a payload exactly the way verifyCallbackSignature does: HMAC over the
 * JSON of every field except `signature`. This guarantees the test exercises the
 * freshness check rather than false-passing on a signature mismatch.
 */
async function signCallback<T extends Record<string, unknown>>(
  data: T
): Promise<T & { signature: string }> {
  const signature = await computeHmacHex(JSON.stringify(data), SECRET);
  return { ...data, signature };
}

// Route tests go through .fetch() with an ExecutionContext stub. The stale path
// short-circuits before c.executionCtx.waitUntil(...), so no scheduled work runs.
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function post(path: string, body: unknown): Promise<Response> {
  const req = new Request(`https://test.local${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return Promise.resolve(callbacksRouter.fetch(req, env, ctx));
}

describe("POST /complete timestamp freshness", () => {
  const base = {
    sessionId: "sess-1",
    messageId: "msg-1",
    success: true,
    context: { source: "linear", issueId: "issue-1" },
  };

  it("rejects a correctly-signed but stale callback (replay) with stale_timestamp", async () => {
    // Just past the replay window, so the freshness check (not HMAC) drives the 401.
    const staleMs = Date.now() - CALLBACK_TIMESTAMP_VALIDITY_MS - 1000;
    const payload = await signCallback({ ...base, timestamp: staleMs });

    // Signature is valid: the 401 must come from the freshness check, not HMAC.
    expect(await verifyCallbackSignature(payload, SECRET)).toBe(true);

    const res = await post("/complete", payload);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});

describe("POST /tool_call timestamp freshness", () => {
  const base = {
    sessionId: "sess-1",
    tool: "bash",
    args: { command: "ls" },
    callId: "call-1",
    // No agentSessionId/organizationId: the accept path short-circuits before
    // any network call, keeping the fresh test free of unhandled rejections.
    context: { source: "linear", issueId: "issue-1" },
  };

  it("rejects a correctly-signed but stale tool_call callback", async () => {
    const staleMs = Date.now() - CALLBACK_TIMESTAMP_VALIDITY_MS - 1000;
    const payload = await signCallback({ ...base, timestamp: staleMs });

    expect(await verifyCallbackSignature(payload, SECRET)).toBe(true);

    const res = await post("/tool_call", payload);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("accepts a fresh, correctly-signed tool_call callback", async () => {
    const payload = await signCallback({ ...base, timestamp: Date.now() });

    const res = await post("/tool_call", payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
