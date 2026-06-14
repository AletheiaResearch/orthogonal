import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
} from "payload";

import { formatSlugHook, validateSlug } from "../fields/slug";
import { deferRevalidate } from "../lib/revalidate";

// A category edit affects the blog index, the sitemap, and the category's own
// archive page. The slug lives on the doc, so no lookup is needed. On rename the
// previous archive path is revalidated too, so the old URL stops 200-ing stale.
const revalidateCategory: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;

  const paths = new Set<string>(["/blog", "/sitemap.xml"]);
  if (doc?.slug) paths.add(`/blog/category/${doc.slug}`);
  if (previousDoc?.slug && previousDoc.slug !== doc?.slug) {
    paths.add(`/blog/category/${previousDoc.slug}`);
  }

  deferRevalidate(payload, paths);
  return doc;
};

const revalidateCategoryDelete: CollectionAfterDeleteHook = ({
  doc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;

  const paths = new Set<string>(["/blog", "/sitemap.xml"]);
  if (doc?.slug) paths.add(`/blog/category/${doc.slug}`);

  deferRevalidate(payload, paths);
  return doc;
};

export const Categories: CollectionConfig = {
  slug: "categories",
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug"],
  },
  hooks: {
    afterChange: [revalidateCategory],
    afterDelete: [revalidateCategoryDelete],
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      hooks: {
        beforeValidate: [formatSlugHook],
      },
      validate: validateSlug,
    },
    {
      name: "description",
      type: "textarea",
    },
  ],
};
