import { applyD1Migrations, env } from "cloudflare:test";

// Apply the Drizzle-generated D1 migrations to the shared Miniflare D1 before tests.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
