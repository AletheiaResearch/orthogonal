import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it } from "vitest";

import { policies, policyVersions } from "../../src/db/schema";

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
