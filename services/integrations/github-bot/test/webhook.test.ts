import { describe, it, expect, vi } from "vitest";

import app from "../src/index";
import type { Env } from "../src/types";

/** Generate a valid GitHub webhook signature for a given secret and body. */
async function sign(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

const SECRET = "test-webhook-secret";

function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

function makeEnv(): Env {
  const githubKv = createMockKV();
  return {
    GITHUB_KV: githubKv as unknown as KVNamespace,
    CONTROL_PLANE: {
      fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    } as unknown as Fetcher,
    DEPLOYMENT_NAME: "test",
    DEFAULT_MODEL: "anthropic/claude-haiku-4-5",
    GITHUB_BOT_USERNAME: "test-bot[bot]",
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: "test-key",
    GITHUB_APP_INSTALLATION_ID: "67890",
    GITHUB_WEBHOOK_SECRET: SECRET,
    INTERNAL_CALLBACK_SECRET: "test-internal-secret",
    LOG_LEVEL: "error",
  } satisfies Env;
}

function makeCtx() {
  return {
    props: {},
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as any;
}

async function flushWaitUntil(ctx: ReturnType<typeof makeCtx>, callIndex = 0): Promise<void> {
  await ctx.waitUntil.mock.calls[callIndex]?.[0];
}

describe("POST /webhooks/github", () => {
  it("returns 401 for invalid signature", async () => {
    const body = '{"action":"created"}';
    const res = await app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": "sha256=invalid",
          "X-GitHub-Event": "issue_comment",
        },
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: "invalid signature" });
  });

  it("returns 401 for missing signature", async () => {
    const res = await app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body: "{}",
        headers: { "X-GitHub-Event": "push" },
      }),
      makeEnv(),
      makeCtx()
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 and calls waitUntil for valid webhook", async () => {
    const body = JSON.stringify({
      action: "review_requested",
      repository: { owner: { login: "test" }, name: "repo" },
    });
    const signature = await sign(SECRET, body);
    const ctx = makeCtx();

    const res = await app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "pull_request",
          "X-GitHub-Delivery": "delivery-123",
        },
      }),
      makeEnv(),
      ctx
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // One waitUntil for the legacy bot path, one for the additive control-plane forward.
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);
    await flushWaitUntil(ctx, 0);
    await flushWaitUntil(ctx, 1);
  });

  it("deduplicates repeated deliveries by X-GitHub-Delivery", async () => {
    const body = JSON.stringify({
      action: "review_requested",
      repository: { owner: { login: "test" }, name: "repo" },
    });
    const signature = await sign(SECRET, body);
    const ctx = makeCtx();
    const env = makeEnv();

    const request = () =>
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "pull_request",
          "X-GitHub-Delivery": "delivery-123",
        },
      });

    const firstRes = await app.fetch(request(), env, ctx);
    expect(firstRes.status).toBe(200);
    expect(await firstRes.json()).toEqual({ ok: true });
    await flushWaitUntil(ctx, 0);
    await flushWaitUntil(ctx, 1);

    const secondRes = await app.fetch(request(), env, ctx);
    expect(secondRes.status).toBe(200);
    expect(await secondRes.json()).toEqual({ ok: true, duplicate: true });
    await flushWaitUntil(ctx, 2);

    // First delivery: legacy + forward waitUntil. Duplicate delivery: forward waitUntil
    // only (the legacy path is skipped). review_requested does not normalize, so the
    // forward exits before touching KV — the delivery dedupe get/put counts are unchanged.
    expect(ctx.waitUntil).toHaveBeenCalledTimes(3);
    const githubKv = env.GITHUB_KV as unknown as {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    };
    expect(githubKv.get).toHaveBeenCalledTimes(2);
    expect(githubKv.put).toHaveBeenCalledTimes(2);
  });

  it("allows redelivery after async processing failure clears the marker", async () => {
    const body = JSON.stringify({
      action: "opened",
      pull_request: {
        number: 42,
        title: "Broken payload",
        body: null,
        user: { login: "alice" },
        head: { ref: "feature/test", sha: "abc123" },
        base: { ref: "main" },
        draft: false,
      },
      repository: null,
      sender: { login: "alice" },
    });
    const signature = await sign(SECRET, body);
    const ctx = makeCtx();
    const env = makeEnv();

    const request = () =>
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "pull_request",
          "X-GitHub-Delivery": "delivery-failure",
        },
      });

    const firstRes = await app.fetch(request(), env, ctx);
    expect(firstRes.status).toBe(200);
    expect(await firstRes.json()).toEqual({ ok: true });
    await flushWaitUntil(ctx, 0);
    await flushWaitUntil(ctx, 1);

    const secondRes = await app.fetch(request(), env, ctx);
    expect(secondRes.status).toBe(200);
    expect(await secondRes.json()).toEqual({ ok: true });
    await flushWaitUntil(ctx, 2);
    await flushWaitUntil(ctx, 3);

    // Each delivery schedules a legacy waitUntil and a forward waitUntil. Because the
    // legacy handler throws (null repository), the first delivery clears its marker, so
    // the second delivery is not a duplicate and runs the legacy path again — clearing
    // the marker a second time.
    expect(ctx.waitUntil).toHaveBeenCalledTimes(4);
    const githubKv = env.GITHUB_KV as unknown as {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    expect(githubKv.delete).toHaveBeenCalledTimes(2);
  });

  it("returns 200 for unhandled event type", async () => {
    const body = '{"action":"opened"}';
    const signature = await sign(SECRET, body);
    const ctx = makeCtx();

    const res = await app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "push",
        },
      }),
      makeEnv(),
      ctx
    );

    expect(res.status).toBe(200);
    // Legacy waitUntil plus the additive forward waitUntil.
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);
    await flushWaitUntil(ctx, 0);
    await flushWaitUntil(ctx, 1);
  });

  it("returns 200 for handled event with non-matching action", async () => {
    const body = JSON.stringify({
      action: "closed",
      repository: { owner: { login: "test" }, name: "repo" },
    });
    const signature = await sign(SECRET, body);
    const ctx = makeCtx();

    const res = await app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "pull_request",
        },
      }),
      makeEnv(),
      ctx
    );

    expect(res.status).toBe(200);
    // Legacy waitUntil plus the additive forward waitUntil.
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);
    await flushWaitUntil(ctx, 0);
    await flushWaitUntil(ctx, 1);
  });

  it("returns 400 and clears the processing marker for a malformed payload", async () => {
    const body = "{not valid json";
    const signature = await sign(SECRET, body);
    const ctx = makeCtx();
    const env = makeEnv();

    const res = await app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "pull_request",
          "X-GitHub-Delivery": "delivery-malformed",
        },
      }),
      env,
      ctx
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid payload" });
    // No async work scheduled — neither legacy processing nor the forward.
    expect(ctx.waitUntil).not.toHaveBeenCalled();

    const githubKv = env.GITHUB_KV as unknown as {
      put: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    // The in-flight "processing" marker we wrote before parsing is cleared so a
    // corrected redelivery (same delivery id) is not blocked for the marker TTL.
    expect(githubKv.put).toHaveBeenCalledWith(
      "delivery:delivery-malformed",
      "processing",
      expect.anything()
    );
    expect(githubKv.delete).toHaveBeenCalledWith("delivery:delivery-malformed");
  });

  it("does not clear a pre-existing marker when a duplicate delivery is malformed", async () => {
    const body = "{still bad";
    const signature = await sign(SECRET, body);
    const ctx = makeCtx();
    const env = makeEnv();

    // Seed an existing delivery marker so this request is treated as a duplicate.
    const githubKv = env.GITHUB_KV as unknown as {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    await githubKv.put("delivery:delivery-dupe-bad", "processed");
    githubKv.delete.mockClear();
    githubKv.put.mockClear();

    const res = await app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "pull_request",
          "X-GitHub-Delivery": "delivery-dupe-bad",
        },
      }),
      env,
      ctx
    );

    expect(res.status).toBe(400);
    // We did not write the marker this time, so we must not delete someone else's marker.
    expect(githubKv.delete).not.toHaveBeenCalled();
  });
});

describe("control-plane forward decoupling", () => {
  // pull_request/synchronize is normalized for the control-plane forward but is NOT a
  // legacy handler action, so the legacy path never touches CONTROL_PLANE — every
  // CONTROL_PLANE.fetch observed here is the additive forward.
  const synchronizeBody = JSON.stringify({
    action: "synchronize",
    pull_request: {
      number: 42,
      head: { ref: "feature/cache", sha: "abc123" },
      base: { ref: "main" },
    },
    repository: { owner: { login: "acme" }, name: "widgets" },
    sender: { login: "alice" },
  });

  function makeForwardEnv(controlPlaneFetch: ReturnType<typeof vi.fn>) {
    const githubKv = createMockKV();
    return {
      GITHUB_KV: githubKv,
      CONTROL_PLANE: { fetch: controlPlaneFetch },
      GITHUB_WEBHOOK_SECRET: SECRET,
      GITHUB_BOT_USERNAME: "test-bot[bot]",
      DEPLOYMENT_NAME: "test",
      DEFAULT_MODEL: "anthropic/claude-haiku-4-5",
      INTERNAL_CALLBACK_SECRET: "test-internal-secret",
      LOG_LEVEL: "error",
    } as unknown as Env;
  }

  async function postSynchronize(env: Env, ctx: ReturnType<typeof makeCtx>) {
    const signature = await sign(SECRET, synchronizeBody);
    return app.fetch(
      new Request("http://localhost/webhooks/github", {
        method: "POST",
        body: synchronizeBody,
        headers: {
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": "pull_request",
          "X-GitHub-Delivery": "delivery-sync",
        },
      }),
      env,
      ctx
    );
  }

  it("retries the forward on redelivery after a transient failure and keeps legacy intact", async () => {
    let attempt = 0;
    const controlPlaneFetch = vi.fn(async () => {
      attempt += 1;
      // First forward attempt fails transiently; the redelivery succeeds.
      return new Response(attempt === 1 ? "boom" : "ok", { status: attempt === 1 ? 500 : 200 });
    });
    const env = makeForwardEnv(controlPlaneFetch);
    const ctx = makeCtx();
    const githubKv = env.GITHUB_KV as unknown as {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    };

    // First delivery: legacy skips (synchronize is not a legacy action) and the forward
    // gets a 500.
    const firstRes = await postSynchronize(env, ctx);
    expect(firstRes.status).toBe(200);
    await flushWaitUntil(ctx, 0); // legacy (no-op skip)
    await flushWaitUntil(ctx, 1); // forward (fails)

    expect(controlPlaneFetch).toHaveBeenCalledTimes(1);
    // Forward failed → its own dedupe marker was NOT written, so a redelivery retries.
    expect(await githubKv.get("forward:delivery-sync")).toBeNull();
    // Legacy delivery marker was still promoted to "processed" (legacy behavior intact).
    expect(await githubKv.get("delivery:delivery-sync")).toBe("processed");

    // GitHub redelivers the same delivery id. Legacy is now a duplicate, but the forward
    // must run again and this time succeed.
    const secondRes = await postSynchronize(env, ctx);
    expect(secondRes.status).toBe(200);
    expect(await secondRes.json()).toEqual({ ok: true, duplicate: true });
    await flushWaitUntil(ctx, 2); // forward retry (succeeds)

    expect(controlPlaneFetch).toHaveBeenCalledTimes(2);
    // Successful forward writes its own marker.
    expect(await githubKv.get("forward:delivery-sync")).toBe("forwarded");
  });

  it("does not re-forward once the forward has succeeded", async () => {
    const controlPlaneFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const env = makeForwardEnv(controlPlaneFetch);
    const ctx = makeCtx();

    const firstRes = await postSynchronize(env, ctx);
    expect(firstRes.status).toBe(200);
    await flushWaitUntil(ctx, 0);
    await flushWaitUntil(ctx, 1);
    expect(controlPlaneFetch).toHaveBeenCalledTimes(1);

    // Redelivery of a successfully forwarded event must not hit the control plane again.
    const secondRes = await postSynchronize(env, ctx);
    expect(secondRes.status).toBe(200);
    await flushWaitUntil(ctx, 2);
    expect(controlPlaneFetch).toHaveBeenCalledTimes(1);
  });
});

describe("GET /health", () => {
  it("returns healthy status", async () => {
    const res = await app.fetch(new Request("http://localhost/health"), makeEnv(), makeCtx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "healthy",
      service: "open-inspect-github-bot",
    });
  });
});
