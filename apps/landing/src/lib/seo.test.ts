import { afterEach, describe, expect, it, vi } from "vitest";

import { isIndexable } from "./seo";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isIndexable", () => {
  it('is true only when SITE_INDEXABLE === "true"', () => {
    vi.stubEnv("SITE_INDEXABLE", "true");
    expect(isIndexable()).toBe(true);
  });
  it("is false when unset or any other value", () => {
    vi.stubEnv("SITE_INDEXABLE", "");
    expect(isIndexable()).toBe(false);
    vi.stubEnv("SITE_INDEXABLE", "false");
    expect(isIndexable()).toBe(false);
  });
});
