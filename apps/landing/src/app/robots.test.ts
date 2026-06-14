import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots", () => {
  it("disallows everything when not indexable (coming-soon)", () => {
    vi.stubEnv("SITE_INDEXABLE", "false");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://orto.sh");
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });

  it("allows crawl (except admin/api) + advertises the sitemap when indexable", () => {
    vi.stubEnv("SITE_INDEXABLE", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://orto.sh");
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] });
    expect(result.sitemap).toBe("https://orto.sh/sitemap.xml");
  });
});
