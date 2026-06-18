import { mintGatewayToken } from "@open-inspect/shared";
import { MockLanguageModelV3 } from "ai/test";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import type { CredentialProvider } from "../../src/credentials/provider";
import { policies, policyVersions } from "../../src/db/schema";
import type { Env } from "../../src/env";
import { GatewayError } from "../../src/errors";
import { createApp } from "../../src/index";
import { PolicyStore } from "../../src/policy/store";

const seedEnv = (blob: object) => ({ TERMINUS_GATEWAY_POLICY: JSON.stringify(blob) });

const db = drizzle(env.DB);

afterEach(async () => {
  await db.delete(policyVersions);
  await db.delete(policies);
});

describe("policies + policy_versions schema (D1)", () => {
  it("persists a policy row with platform-owner defaults", async () => {
    const now = 1000;
    await db
      .insert(policies)
      .values({ id: "p1", name: "platform-default", createdAt: now, updatedAt: now });
    const [p] = await db.select().from(policies).all();
    expect(p.name).toBe("platform-default");
    expect(p.ownerType).toBe("platform");
    expect(p.ownerId).toBe("");
    expect(p.enabled).toBe(true);
  });

  it("persists a version row carrying the JSON blob + active flag", async () => {
    const now = 1000;
    await db
      .insert(policies)
      .values({ id: "p1", name: "platform-default", createdAt: now, updatedAt: now });
    await db.insert(policyVersions).values({
      id: "v1",
      policyId: "p1",
      version: 1,
      config: '{"schemaVersion":1}',
      isActive: true,
      createdAt: now,
    });
    const [v] = await db.select().from(policyVersions).all();
    expect(v.policyId).toBe("p1");
    expect(v.version).toBe(1);
    expect(v.isActive).toBe(true);
    expect(v.config).toContain("schemaVersion");
  });
});

describe("PolicyStore (D1)", () => {
  it("lazy-seeds a platform-default policy from the env blob and returns it", async () => {
    const store = new PolicyStore(
      db,
      seedEnv({ schemaVersion: 1, guardrails: { deniedModels: ["openai/o1"] } }),
      { now: () => 1000, cache: new Map() }
    );
    const p = await store.getActivePolicy();
    expect(p?.guardrails.deniedModels).toEqual(["openai/o1"]);
    expect((await db.select().from(policies).all()).length).toBe(1);
    const [v] = await db.select().from(policyVersions).all();
    expect(v.version).toBe(1);
    expect(v.isActive).toBe(true);
  });

  it("returns null when nothing is configured (no env, no rows) — pass-through", async () => {
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });
    expect(await store.getActivePolicy()).toBeNull();
  });

  it("returns null and writes no rows when no policy row and no seed env exist", async () => {
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });

    expect(await store.getActivePolicy()).toBeNull();
    expect(await db.select().from(policies).all()).toEqual([]);
    expect(await db.select().from(policyVersions).all()).toEqual([]);
  });

  it("fails closed when a seedless existing policy has no active version", async () => {
    await db
      .insert(policies)
      .values({ id: "p1", name: "platform-default", createdAt: 1, updatedAt: 1 });
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });

    await expect(store.getActivePolicy()).rejects.toBeInstanceOf(GatewayError);
    await expect(store.getActivePolicy()).rejects.toMatchObject({ status: 503 });
    expect((await db.select().from(policies).all()).length).toBe(1);
    expect(await db.select().from(policyVersions).all()).toEqual([]);
  });

  it("completes a mid-seed policy row when env is configured", async () => {
    await db
      .insert(policies)
      .values({ id: "p-winning", name: "platform-default", createdAt: 1, updatedAt: 1 });
    const seed = { schemaVersion: 1, guardrails: { deniedModels: ["seeded/model"] } };
    const store = new PolicyStore(db, seedEnv(seed), { now: () => 1000, cache: new Map() });

    expect((await store.getActivePolicy())?.guardrails.deniedModels).toEqual(["seeded/model"]);
    expect((await db.select().from(policies).all()).length).toBe(1);
    const versions = await db.select().from(policyVersions).all();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      policyId: "p-winning",
      version: 1,
      isActive: true,
    });
    expect(JSON.parse(versions[0].config).guardrails.deniedModels).toEqual(["seeded/model"]);
  });

  it("keeps mid-seed completion idempotent on a fresh cache", async () => {
    await db
      .insert(policies)
      .values({ id: "p-winning", name: "platform-default", createdAt: 1, updatedAt: 1 });
    const seed = { schemaVersion: 1, guardrails: { deniedModels: ["seeded/model"] } };
    const store = new PolicyStore(db, seedEnv(seed), { now: () => 1000, cache: new Map() });

    expect((await store.getActivePolicy())?.guardrails.deniedModels).toEqual(["seeded/model"]);
    const freshStore = new PolicyStore(db, seedEnv(seed), { now: () => 1001, cache: new Map() });
    expect((await freshStore.getActivePolicy())?.guardrails.deniedModels).toEqual(["seeded/model"]);
    const versions = await db.select().from(policyVersions).all();
    expect(versions).toHaveLength(1);
    expect(versions[0].policyId).toBe("p-winning");
  });

  it("fails closed (503) when a configured active version has an invalid blob", async () => {
    await db
      .insert(policies)
      .values({ id: "p1", name: "platform-default", createdAt: 1, updatedAt: 1 });
    await db.insert(policyVersions).values({
      id: "v1",
      policyId: "p1",
      version: 1,
      config: "{not json",
      isActive: true,
      createdAt: 1,
    });
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });
    await expect(store.getActivePolicy()).rejects.toBeInstanceOf(GatewayError);
    await expect(store.getActivePolicy()).rejects.toMatchObject({ status: 503 });
  });

  it("caches the active policy within the TTL and refreshes after it", async () => {
    let clock = 1000;
    const store = new PolicyStore(
      db,
      seedEnv({ schemaVersion: 1, guardrails: { deniedModels: ["a/b"] } }),
      { now: () => clock, cache: new Map(), ttlMs: 30_000 }
    );
    expect((await store.getActivePolicy())?.guardrails.deniedModels).toEqual(["a/b"]);
    // mutate the stored config directly (bypassing the store → cache is unaware)
    await db
      .update(policyVersions)
      .set({ config: JSON.stringify({ schemaVersion: 1, guardrails: { deniedModels: ["c/d"] } }) })
      .where(eq(policyVersions.isActive, true));
    expect((await store.getActivePolicy())?.guardrails.deniedModels).toEqual(["a/b"]); // cached
    clock += 31_000;
    expect((await store.getActivePolicy())?.guardrails.deniedModels).toEqual(["c/d"]); // refreshed
  });

  it("admin: create policy → add versions → activate → rollback", async () => {
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });
    const { id } = await store.createPolicy({ name: "platform-default" });
    const v1 = (await store.createVersion(
      id,
      { schemaVersion: 1, guardrails: { deniedModels: ["m/1"] } },
      true
    ))!;
    const v2 = (await store.createVersion(
      id,
      { schemaVersion: 1, guardrails: { deniedModels: ["m/2"] } },
      true
    ))!;
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    const active = await db
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.isActive, true))
      .all();
    expect(active.length).toBe(1);
    expect(active[0].version).toBe(2);
    expect((await store.getActivePolicy())?.guardrails.deniedModels).toEqual(["m/2"]);
    // rollback to v1
    expect(await store.setActiveVersion(id, 1)).toBe(true);
    const active2 = await db
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.isActive, true))
      .all();
    expect(active2.length).toBe(1);
    expect(active2[0].version).toBe(1);
    expect((await store.listVersions(id)).length).toBe(2);
    expect(await store.setActiveVersion(id, 99)).toBe(false);
  });

  it("createPolicy rejects non-default names in v1", async () => {
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });

    await expect(store.createPolicy({ name: "other" })).rejects.toThrow(/platform-default/);
    expect(await db.select().from(policies).all()).toEqual([]);
  });

  it("createVersion returns null for a nonexistent policy without writing an orphan", async () => {
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });
    const result = await store.createVersion(
      "missing-policy",
      { schemaVersion: 1, guardrails: {} },
      true
    );

    expect(result).toBeNull();
    expect(await db.select().from(policyVersions).all()).toEqual([]);
  });

  it("loads only the v1 platform-default policy when other named policies are active", async () => {
    await db.insert(policies).values([
      { id: "p-other", name: "other", createdAt: 1, updatedAt: 1 },
      { id: "p-default", name: "platform-default", createdAt: 1, updatedAt: 1 },
    ]);
    await db.insert(policyVersions).values([
      {
        id: "v-other",
        policyId: "p-other",
        version: 1,
        config: JSON.stringify({ schemaVersion: 1, guardrails: { deniedModels: ["other/model"] } }),
        isActive: true,
        createdAt: 1,
      },
      {
        id: "v-default",
        policyId: "p-default",
        version: 1,
        config: JSON.stringify({
          schemaVersion: 1,
          guardrails: { deniedModels: ["default/model"] },
        }),
        isActive: true,
        createdAt: 1,
      },
    ]);

    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });
    expect((await store.getActivePolicy())?.guardrails.deniedModels).toEqual(["default/model"]);
  });

  it("createVersion rejects an invalid blob (a plain error, not a 503)", async () => {
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });
    const { id } = await store.createPolicy({});
    await expect(store.createVersion(id, { schemaVersion: 2 }, true)).rejects.toThrow();
  });
});

describe("policy enforcement end-to-end (app + real PolicyStore + D1)", () => {
  type MockArgs = ConstructorParameters<typeof MockLanguageModelV3>[0];
  const SECRET = "e2e-secret-please-rotate";
  const e2eEnv = { TERMINUS_JWT_SECRET: SECRET, DB: env.DB } as unknown as Env;

  const E2E_REGISTRY = {
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      env: ["ANTHROPIC_API_KEY"],
      npm: "@ai-sdk/anthropic",
      models: {
        "claude-opus-4-5": {
          id: "claude-opus-4-5",
          name: "Claude Opus 4.5",
          limit: { context: 1000, output: 1000 },
          modalities: { input: ["text"], output: ["text"] },
        },
      },
    },
  };

  const e2eCreds: CredentialProvider = {
    forModel: () => Promise.resolve({ apiKey: "k" }),
    forModelCandidates: () =>
      Promise.resolve([
        { id: "c", failureCount: 0, resolve: () => Promise.resolve({ apiKey: "k" }) },
      ]),
    isEnabled: () => Promise.resolve(true),
  };

  const okModel = () =>
    new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: "text", text: "ok" }],
          finishReason: "stop",
          usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
          warnings: [],
        }),
    } as unknown as MockArgs);

  async function chat(model: string, seed: object): Promise<Response> {
    // Real PolicyStore over real D1, fresh cache per call (no cross-test module-cache bleed).
    const app = createApp({
      loadRegistry: () => Promise.resolve(E2E_REGISTRY),
      buildCredentials: () => e2eCreds,
      buildPolicyStore: (e) =>
        new PolicyStore(
          drizzle(e.DB),
          { TERMINUS_GATEWAY_POLICY: JSON.stringify(seed) },
          { cache: new Map() }
        ),
      chat: { buildModel: () => okModel() },
    });
    const tok = await mintGatewayToken({ sid: "s", allowed_models: [] }, SECRET);
    return app.request(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
      },
      e2eEnv
    );
  }

  it("denies a model blocked by the seeded policy (403, lazy-seeded from the env blob)", async () => {
    const res = await chat("anthropic/claude-opus-4-5", {
      schemaVersion: 1,
      guardrails: { deniedModels: ["anthropic/claude-opus-4-5"] },
    });
    expect(res.status).toBe(403);
    // the seed materialized a platform-default policy + active version
    expect((await db.select().from(policies).all()).length).toBe(1);
  });

  it("serves a model allowed by the seeded policy (200)", async () => {
    const res = await chat("anthropic/claude-opus-4-5", {
      schemaVersion: 1,
      guardrails: { allowedModels: ["anthropic/claude-opus-4-5"] },
    });
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { choices: { message: { content: string } }[] }).choices[0].message
        .content
    ).toBe("ok");
  });
});
