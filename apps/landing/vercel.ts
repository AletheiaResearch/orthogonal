import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  // Build only when this app or a workspace dependency changed — see scripts/vercel-ignore.sh.
  ignoreCommand: "bash ../../scripts/vercel-ignore.sh @orthogonal/landing",
};
