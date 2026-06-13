import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "storybook",
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  buildCommand: "pnpm run build",
  outputDirectory: "storybook-static",
  // Build only when Storybook or a workspace dependency changed — see scripts/vercel-ignore.sh.
  ignoreCommand: "bash ../../scripts/vercel-ignore.sh @orthogonal/storybook",
};
