/**
 * PostHog analytics is enabled only when NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
 * is set (inlined at build time). Guards every posthog-js call so local dev
 * and preview builds without a token stay silent.
 */
export const posthogEnabled = Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);
