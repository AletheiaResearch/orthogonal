import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
  PayloadRequest,
} from "payload";

import { formatSlugHook, validateSlug } from "../fields/slug";
import { deferRevalidate } from "../lib/revalidate";

// Key under which beforeDelete stashes the dependent post paths for afterDelete.
const CATEGORY_DELETE_POST_PATHS = "categoryDeletePostPaths";

// A category's title/slug renders as a badge on every post that references it, so
// collect the `/blog/<slug>` path of each published post referencing the
// category. Mirrors collectAuthorPaths in Authors.ts. Returns only the per-post
// paths; callers add the unconditional /blog + /sitemap.xml + archive paths,
// which always exist for a category.
const collectCategoryPostPaths = async (
  payload: PayloadRequest["payload"],
  categoryId: number | string
): Promise<Set<string>> => {
  const paths = new Set<string>();
  const { docs } = await payload.find({
    collection: "posts",
    where: {
      _status: { equals: "published" },
      categories: { in: [categoryId] },
    },
    depth: 0,
    limit: 0,
  });
  for (const post of docs) {
    if (post.slug) paths.add(`/blog/${post.slug}`);
  }
  return paths;
};

// A category edit affects the blog index, the sitemap, the category's own archive
// page, and every published post that renders its badge. The slug lives on the
// doc, so no lookup is needed for the archive path. On rename the previous archive
// path is revalidated too, so the old URL stops 200-ing stale.
const revalidateCategory: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;

  const paths = await collectCategoryPostPaths(payload, doc.id);
  paths.add("/blog");
  paths.add("/sitemap.xml");
  if (doc?.slug) paths.add(`/blog/category/${doc.slug}`);
  if (previousDoc?.slug && previousDoc.slug !== doc?.slug) {
    paths.add(`/blog/category/${previousDoc.slug}`);
  }

  deferRevalidate(payload, paths);
  return doc;
};

// The posts→category relationship rows may already be gone in afterDelete, so
// capture the dependent post paths here while the join still resolves and stash
// them in req.context for afterDelete to consume.
const captureCategoryDeletePaths: CollectionBeforeDeleteHook = async ({
  id,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return;
  context[CATEGORY_DELETE_POST_PATHS] = [...(await collectCategoryPostPaths(payload, id))];
};

const revalidateCategoryDelete: CollectionAfterDeleteHook = ({
  doc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;

  const paths = new Set<string>(["/blog", "/sitemap.xml"]);
  if (doc?.slug) paths.add(`/blog/category/${doc.slug}`);
  const stashed = context[CATEGORY_DELETE_POST_PATHS];
  if (Array.isArray(stashed)) {
    for (const path of stashed) paths.add(path as string);
  }

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
    beforeDelete: [captureCategoryDeletePaths],
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
