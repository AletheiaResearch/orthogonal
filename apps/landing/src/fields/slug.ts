import type { FieldHook, Validate } from "payload";

/** Slugs that collide with app routes / reserved paths and must be rejected. */
export const RESERVED_SLUGS = [
  "category",
  "categories",
  "author",
  "authors",
  "tag",
  "tags",
  "admin",
  "api",
  "blog",
  "preview",
  "sitemap.xml",
  "rss.xml",
  "feed",
] as const;

// Unicode combining marks (left after NFKD decomposition of accented letters).
// Built via new RegExp so the source stays pure-ASCII (no literal combining chars).
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Convert arbitrary text into a URL-safe slug. */
export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "") // strip diacritics
    .replace(/[\s_]+/g, "-") // whitespace/underscore -> hyphen (before dropping)
    .replace(/[^a-z0-9-]/g, "") // drop remaining non-alphanumerics
    .replace(/-+/g, "-") // collapse repeats
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

/**
 * beforeValidate field hook: derive the slug from the title when the slug is
 * empty, otherwise normalize whatever the editor typed.
 */
export const formatSlugHook: FieldHook = ({ value, originalDoc, data }) => {
  if (typeof value === "string" && value.length > 0) {
    return slugify(value);
  }
  const fallback = (data?.title ?? originalDoc?.title) as string | undefined;
  if (typeof fallback === "string" && fallback.length > 0) {
    return slugify(fallback);
  }
  return value;
};

/**
 * Field validate fn: return `true` for valid, or a `string` error message for
 * invalid. Tolerates empty so it composes with `required`.
 */
export const validateSlug: Validate<string | undefined> = (value) => {
  if (!value) return true;
  if ((RESERVED_SLUGS as readonly string[]).includes(value)) {
    return `"${value}" is a reserved slug and cannot be used.`;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return "Slug may contain only lowercase letters, numbers, and single hyphens.";
  }
  return true;
};
