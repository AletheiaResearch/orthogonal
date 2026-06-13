import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  // Skip the deploy unless this app or one of its workspace dependencies (e.g. @orthogonal/ui)
  // changed. `turbo query affected` diffs the graph against the previously deployed commit and exits
  // 1 (affected → build), 0 (unaffected → skip), or 2 (error → Vercel builds, fail-safe).
  // Runs before install: uses Vercel's global turbo (--skip-infer avoids re-downloading the pinned
  // version pre-install); reads turbo.json + git history (both kept out of .vercelignore).
  ignoreCommand:
    'turbo query affected --skip-infer --packages @orthogonal/orto --base "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" --exit-code',
};
