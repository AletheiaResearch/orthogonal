import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { providerCredentials } from "../../src/db/schema";
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
  await db.delete(providerCredentials);
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

describe("admin credential ingestion API (CON-70)", () => {
  it("rejects missing or wrong bearer with 401", async () => {
    const noAuth = await buildAdminApp().request("/credentials", {}, adminEnv);
    expect(noAuth.status).toBe(401);
    const wrong = await req("/credentials", { auth: "nope" });
    expect(wrong.status).toBe(401);
  });

  it("creates, lists (never leaking the secret), disables, and deletes a credential", async () => {
    const create = await req("/credentials", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", apiKey: "sk-secret", label: "a", priority: 5 }),
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };
    expect(id).toBeTruthy();

    const list = await req("/credentials");
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      credentials: { id: string; provider: string; label: string; priority: number }[];
    };
    expect(body.credentials).toHaveLength(1);
    expect(body.credentials[0]).toMatchObject({ provider: "openai", label: "a", priority: 5 });
    expect(JSON.stringify(body)).not.toContain("sk-secret");

    const patch = await req(`/credentials/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    expect(patch.status).toBe(204);

    const del = await req(`/credentials/${id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const delAgain = await req(`/credentials/${id}`, { method: "DELETE" });
    expect(delAgain.status).toBe(404);
  });

  it("rejects a create missing provider/apiKey with 400", async () => {
    const res = await req("/credentials", {
      method: "POST",
      body: JSON.stringify({ provider: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects provider=codex on the api-key ingestion path with 400", async () => {
    const res = await req("/credentials", {
      method: "POST",
      body: JSON.stringify({ provider: "codex", apiKey: "sk" }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(providerCredentials)).toEqual([]);
  });

  it("rejects mistyped optional fields with 400 (no silent default)", async () => {
    const res = await req("/credentials", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", apiKey: "k", enabled: "false" }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(providerCredentials)).toEqual([]);
  });

  it("returns 409 on a duplicate provider+label", async () => {
    const make = () =>
      req("/credentials", {
        method: "POST",
        body: JSON.stringify({ provider: "openai", apiKey: "k", label: "dup" }),
      });
    expect((await make()).status).toBe(201);
    expect((await make()).status).toBe(409);
  });
});
