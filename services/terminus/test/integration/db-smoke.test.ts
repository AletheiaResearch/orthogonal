import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { providerCredentials } from "../../src/db/schema";

describe("D1 vault harness", () => {
  it("applied the migration — provider_credentials is queryable", async () => {
    const db = drizzle(env.DB);
    // Queryability only — the table is shared across integration files, so asserting
    // emptiness here would be order-dependent and flaky.
    const rows = await db.select().from(providerCredentials).all();
    expect(Array.isArray(rows)).toBe(true);
  });
});
