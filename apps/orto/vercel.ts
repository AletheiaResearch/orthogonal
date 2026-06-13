import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  // Skip the deploy unless this app or one of its workspace dependencies (e.g. @orthogonal/ui)
  // changed. `turbo query affected` diffs the graph against the previously deployed commit and exits
  // 1 (affected → build), 0 (unaffected → skip), or 2 (error → Vercel builds, fail-safe).
  // Runs before install: Vercel's global turbo predates the `query affected` subcommand, so fetch a
  // current one via npx; --skip-infer runs that binary directly. Reads turbo.json + git history
  // (both kept out of .vercelignore so this pre-install step can diff the graph).
  ignoreCommand:
    'npx --yes turbo query affected --skip-infer --packages @orthogonal/orto --base "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" --exit-code',
};
