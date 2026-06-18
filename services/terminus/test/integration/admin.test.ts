import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { policies, policyVersions, providerCredentials } from "../../src/db/schema";
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
  await db.delete(policyVersions);
  await db.delete(policies);
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

describe("admin policy API (CON-71 L2)", () => {
  it("rejects missing or wrong bearer with 401", async () => {
    expect((await buildAdminApp().request("/policies", {}, adminEnv)).status).toBe(401);
    expect((await req("/policies", { auth: "nope" })).status).toBe(401);
  });

  async function newPolicy(name = "platform-default"): Promise<string> {
    const res = await req("/policies", { method: "POST", body: JSON.stringify({ name }) });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  it("creates a policy, adds + activates versions, lists, and rolls back", async () => {
    const id = await newPolicy();

    const addVersion = (denied: string) =>
      req(`/policies/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          config: { schemaVersion: 1, guardrails: { deniedModels: [denied] } },
          activate: true,
        }),
      });

    const v1 = await addVersion("m/1");
    expect(v1.status).toBe(201);
    expect(((await v1.json()) as { version: number }).version).toBe(1);
    const v2 = await addVersion("m/2");
    expect(((await v2.json()) as { version: number }).version).toBe(2);

    const list = await req(`/policies/${id}/versions`);
    expect(list.status).toBe(200);
    const versions = ((await list.json()) as { versions: { version: number; isActive: boolean }[] })
      .versions;
    expect(versions).toHaveLength(2);
    expect(versions.filter((v) => v.isActive).map((v) => v.version)).toEqual([2]);

    // rollback to v1
    const rollback = await req(`/policies/${id}/versions/1`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: true }),
    });
    expect(rollback.status).toBe(204);
    const after = (
      (await (await req(`/policies/${id}/versions`)).json()) as {
        versions: { version: number; isActive: boolean }[];
      }
    ).versions;
    expect(after.filter((v) => v.isActive).map((v) => v.version)).toEqual([1]);

    const policiesList = await req("/policies");
    expect(((await policiesList.json()) as { policies: unknown[] }).policies).toHaveLength(1);
  });

  it("accepts an empty create body but rejects malformed JSON without writing", async () => {
    const bad = await req("/policies", { method: "POST", body: "{not json" });
    expect(bad.status).toBe(400);
    expect(await db.select().from(policies)).toEqual([]);

    const empty = await req("/policies", { method: "POST" });
    expect(empty.status).toBe(201);
    expect(await db.select().from(policies)).toHaveLength(1);
  });

  it("rejects non-default policy names in v1", async () => {
    const res = await req("/policies", {
      method: "POST",
      body: JSON.stringify({ name: "alternate" }),
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(policies)).toEqual([]);
  });

  it("returns 409 on a duplicate policy name", async () => {
    expect((await req("/policies", { method: "POST" })).status).toBe(201);
    expect((await req("/policies", { method: "POST" })).status).toBe(409);
  });

  it("rejects an invalid policy blob with 400", async () => {
    const id = await newPolicy();
    const res = await req(`/policies/${id}/versions`, {
      method: "POST",
      body: JSON.stringify({ config: { schemaVersion: 2 }, activate: true }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects mistyped activate fields with 400", async () => {
    const id = await newPolicy();
    const responses = await Promise.all(
      ["true", 1].map((activate) =>
        req(`/policies/${id}/versions`, {
          method: "POST",
          body: JSON.stringify({ config: { schemaVersion: 1, guardrails: {} }, activate }),
        })
      )
    );
    expect(responses.map((res) => res.status)).toEqual([400, 400]);
    expect(await db.select().from(policyVersions)).toEqual([]);
  });

  it("404s adding a version to a nonexistent policy without writing", async () => {
    const res = await req("/policies/missing-policy/versions", {
      method: "POST",
      body: JSON.stringify({ config: { schemaVersion: 1, guardrails: {} }, activate: true }),
    });
    expect(res.status).toBe(404);
    expect(await db.select().from(policyVersions)).toEqual([]);
  });

  it("rejects a versions POST with no config (400)", async () => {
    const id = await newPolicy();
    const res = await req(`/policies/${id}/versions`, { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });

  it("404s activating a nonexistent version", async () => {
    const id = await newPolicy();
    const res = await req(`/policies/${id}/versions/99`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: true }),
    });
    expect(res.status).toBe(404);
  });
});
