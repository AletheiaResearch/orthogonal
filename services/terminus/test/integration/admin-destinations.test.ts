import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { broadcastDestinations } from "../../src/db/schema";
import type { Env } from "../../src/env";
import { buildAdminApp } from "../../src/routes/admin";

const db = drizzle(env.DB);
const ADMIN = "admin-secret-please-rotate";
const adminEnv = {
  DB: env.DB,
  CREDENTIALS_ENCRYPTION_KEY: env.CREDENTIALS_ENCRYPTION_KEY,
  TERMINUS_ADMIN_SECRET: ADMIN,
} as unknown as Env;

afterEach(async () => {
  await db.delete(broadcastDestinations);
});

function req(path: string, init: RequestInit & { auth?: string } = {}): Promise<Response> {
  const { auth = ADMIN, headers, ...rest } = init;
  return buildAdminApp().request(
    path,
    {
      ...rest,
      headers: {
        Authorization: `Bearer ${auth}`,
        "content-type": "application/json",
        ...(headers as Record<string, string> | undefined),
      },
    },
    adminEnv
  );
}

describe("admin broadcast destinations API (CON-73)", () => {
  it("rejects missing or wrong bearer with 401", async () => {
    expect((await buildAdminApp().request("/destinations", {}, adminEnv)).status).toBe(401);
    expect((await req("/destinations", { auth: "nope" })).status).toBe(401);
  });

  it("creates, lists (never leaking the secret), disables, and deletes a destination", async () => {
    const create = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://us.i.posthog.com" },
        secret: { projectApiKey: "phc_secret" },
        samplingRate: 0.5,
        label: "a",
      }),
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };
    expect(id).toBeTruthy();

    const list = await req("/destinations");
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      destinations: {
        id: string;
        type: string;
        label: string;
        enabled: boolean;
        samplingRate: number;
      }[];
    };
    expect(body.destinations).toHaveLength(1);
    expect(body.destinations[0]).toMatchObject({
      type: "posthog",
      label: "a",
      enabled: true,
      samplingRate: 0.5,
    });
    expect(JSON.stringify(body)).not.toContain("phc_secret");

    const patch = await req(`/destinations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    expect(patch.status).toBe(204);

    expect((await req(`/destinations/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await req(`/destinations/${id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("rejects a create missing type/config/secret with 400", async () => {
    expect(
      (await req("/destinations", { method: "POST", body: JSON.stringify({ type: "otlp" }) }))
        .status
    ).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects an unsupported destination type with 400", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({ type: "mystery", config: {}, secret: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a secret-looking header in plaintext config with 400 (no write)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "otlp",
        config: { endpoint: "https://c.example.com", headers: { authorization: "Bearer leak" } },
        secret: {},
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects an unsafe webhook url with 400 (SSRF guard at create)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({ type: "webhook", config: { url: "https://10.0.0.1/x" }, secret: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a samplingRate outside [0,1] with 400", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "otlp",
        config: { endpoint: "https://c.example.com" },
        secret: {},
        samplingRate: 2,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 on a duplicate type+label", async () => {
    const make = () =>
      req("/destinations", {
        method: "POST",
        body: JSON.stringify({
          type: "otlp",
          config: { endpoint: "https://c.example.com" },
          secret: {},
          label: "dup",
        }),
      });
    expect((await make()).status).toBe(201);
    expect((await make()).status).toBe(409);
  });

  it("404s test-connection for a missing destination", async () => {
    expect((await req("/destinations/missing/test", { method: "POST" })).status).toBe(404);
  });

  it("rejects an unsafe OTLP endpoint with 400 (SSRF at create)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "otlp",
        config: { endpoint: "https://169.254.169.254/v1/traces" },
        secret: {},
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });

  it("rejects an unsafe PostHog host with 400 (SSRF at create)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://10.0.0.1" },
        secret: { projectApiKey: "phc_x" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a secret-looking field anywhere in plaintext config with 400 (no write)", async () => {
    const res = await req("/destinations", {
      method: "POST",
      body: JSON.stringify({
        type: "posthog",
        config: { host: "https://us.i.posthog.com", projectApiKey: "phc_leak" },
        secret: { projectApiKey: "phc_x" },
      }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(broadcastDestinations)).toEqual([]);
  });
});
