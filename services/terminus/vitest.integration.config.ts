import { webcrypto } from "node:crypto";
import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Drizzle-generated migrations (drizzle-kit generate → ./migrations).
const migrationsPath = path.resolve(__dirname, "./migrations");

/** Random base64 32-byte AES key for the credential-vault tests. */
function generateTestEncryptionKey(): string {
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(key).toString("base64");
}

// Integration tests run in workerd via Miniflare with a real D1 binding, so the
// credential vault is exercised against the actual Drizzle d1 adapter. They share
// one D1 instance — clean tables in beforeEach/afterEach to avoid cross-test bleed.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(migrationsPath);
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            CREDENTIALS_ENCRYPTION_KEY: generateTestEncryptionKey(),
            TERMINUS_JWT_SECRET: "test-terminus-jwt-secret",
            DEPLOYMENT_NAME: "integration-test",
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["test/integration/apply-migrations.ts"],
  },
});
