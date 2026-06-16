import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { providerCredentials } from "../../src/db/schema";

describe("D1 vault harness", () => {
  it("applied the migration — provider_credentials is queryable and empty", async () => {
    const db = drizzle(env.DB);
    const rows = await db.select().from(providerCredentials).all();
    expect(rows).toEqual([]);
  });
});
