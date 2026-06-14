import type { DefaultNodeTypes, SerializedLinkNode } from "@payloadcms/richtext-lexical";
import { type JSXConvertersFunction, LinkJSXConverter } from "@payloadcms/richtext-lexical/react";

/**
 * Resolve an internal document link to a frontend path. Required by
 * LinkJSXConverter — without it, rich text containing internal links throws at
 * render. Internal links must be populated (query depth >= 1).
 */
const internalDocToHref = ({ linkNode }: { linkNode: SerializedLinkNode }): string => {
  const doc = linkNode.fields.doc;
  const value = doc?.value;
  if (!doc || typeof value !== "object" || value === null) return "/";
  const slug = (value as { slug?: string }).slug;
  if (!slug) return "#";
  switch (doc.relationTo) {
    case "posts":
      return `/blog/${slug}`;
    case "categories":
      return `/blog/category/${slug}`;
    default:
      return `/${slug}`;
  }
};

export const jsxConverters: JSXConvertersFunction<DefaultNodeTypes> = ({ defaultConverters }) => ({
  ...defaultConverters,
  ...LinkJSXConverter({ internalDocToHref }),
});
