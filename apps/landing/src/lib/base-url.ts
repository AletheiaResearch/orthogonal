const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

/** Canonical base URL for SSR/build (no trailing slash). */
export function getServerSideURL(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL);
  if (process.env.VERCEL_ENV === "production") return "https://www.orto.sh";
  if (process.env.VERCEL_URL) return stripTrailingSlash(`https://${process.env.VERCEL_URL}`);
  return "http://localhost:3000";
}
