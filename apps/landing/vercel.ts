import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  // Run Payload migrations against the database, then build (see the "ci" script).
  buildCommand: "pnpm run ci",
  // Build only when this app or a workspace dependency changed — see scripts/vercel-ignore.sh.
  ignoreCommand: "bash ../../scripts/vercel-ignore.sh @orthogonal/landing",
};
