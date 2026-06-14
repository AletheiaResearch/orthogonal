import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerSideURL } from "./base-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getServerSideURL", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    expect(getServerSideURL()).toBe("https://example.com");
  });
  it("falls back to production host then localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getServerSideURL()).toBe("https://www.orto.sh");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(getServerSideURL()).toBe("http://localhost:3000");
  });
  it("falls back to VERCEL_URL when no site URL or production env", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");
    expect(getServerSideURL()).toBe("https://deployment.vercel.app");
  });
  it("strips trailing slashes from env-derived URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    expect(getServerSideURL()).toBe("https://example.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app/");
    expect(getServerSideURL()).toBe("https://deployment.vercel.app");
  });
});
