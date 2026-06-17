import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for the Terminus credential vault (Cloudflare D1 / SQLite).
 * `drizzle-kit generate` reads the schema and emits SQL migrations into ./migrations;
 * the migrations are applied to D1 via Terraform (prod) and to Miniflare D1 (tests).
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
