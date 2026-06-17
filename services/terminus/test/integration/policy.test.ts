import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { policies, policyVersions } from "../../src/db/schema";
import { GatewayError } from "../../src/errors";
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

  it("does not re-seed when a policy already exists (admin owns it)", async () => {
    await db
      .insert(policies)
      .values({ id: "p1", name: "platform-default", createdAt: 1, updatedAt: 1 });
    const store = new PolicyStore(db, seedEnv({ schemaVersion: 1, guardrails: {} }), {
      now: () => 1000,
      cache: new Map(),
    });
    // policy exists but has no active version → pass-through (null), and no extra policy seeded.
    expect(await store.getActivePolicy()).toBeNull();
    expect((await db.select().from(policies).all()).length).toBe(1);
  });

  it("fails closed (503) when a configured active version has an invalid blob", async () => {
    await db
      .insert(policies)
      .values({ id: "p1", name: "platform-default", createdAt: 1, updatedAt: 1 });
    await db
      .insert(policyVersions)
      .values({
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
    const v1 = await store.createVersion(
      id,
      { schemaVersion: 1, guardrails: { deniedModels: ["m/1"] } },
      true
    );
    const v2 = await store.createVersion(
      id,
      { schemaVersion: 1, guardrails: { deniedModels: ["m/2"] } },
      true
    );
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

  it("createVersion rejects an invalid blob (a plain error, not a 503)", async () => {
    const store = new PolicyStore(db, {}, { now: () => 1000, cache: new Map() });
    const { id } = await store.createPolicy({});
    await expect(store.createVersion(id, { schemaVersion: 2 }, true)).rejects.toThrow();
  });
});
