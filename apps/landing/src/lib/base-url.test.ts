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
});
