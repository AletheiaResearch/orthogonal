import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    MODELS_CACHE: KVNamespace;
    TEST_MIGRATIONS: D1Migration[];
    CREDENTIALS_ENCRYPTION_KEY: string;
    TERMINUS_JWT_SECRET: string;
    DEPLOYMENT_NAME: string;
  }
}
