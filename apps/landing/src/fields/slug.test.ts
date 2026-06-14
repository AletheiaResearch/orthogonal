import { describe, expect, it } from "vitest";

import { slugify, validateSlug } from "./slug";

describe("slugify", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(slugify("  Héllo, World! ")).toBe("hello-world");
    expect(slugify("Multiple   spaces__here")).toBe("multiple-spaces-here");
  });
});

describe("validateSlug", () => {
  it("accepts a clean slug", () => {
    expect(validateSlug("my-post", {} as never)).toBe(true);
  });
  it("rejects reserved slugs", () => {
    expect(typeof validateSlug("category", {} as never)).toBe("string");
  });
  it("rejects malformed slugs", () => {
    expect(typeof validateSlug("Bad Slug", {} as never)).toBe("string");
  });
  it("passes through empty (required handles it)", () => {
    expect(validateSlug("", {} as never)).toBe(true);
  });
});
