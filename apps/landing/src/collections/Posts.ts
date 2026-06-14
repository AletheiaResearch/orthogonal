import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  PayloadRequest,
} from "payload";

import { formatSlugHook, validateSlug } from "../fields/slug";
import { deferRevalidate } from "../lib/revalidate";
import type { Post } from "../payload-types";

// A post's category field is `(number | Category)[]` — populated objects when the
// hook ran at depth, bare IDs otherwise. Normalise to IDs either way.
const toCategoryIds = (categories: Post["categories"]): number[] =>
  (categories ?? []).map((category) => (typeof category === "object" ? category.id : category));

// Resolve category IDs to their `/blog/category/<slug>` archive paths.
const categoryArchivePaths = async (
  payload: PayloadRequest["payload"],
  ids: Set<number>
): Promise<string[]> => {
  if (ids.size === 0) return [];
  const { docs } = await payload.find({
    collection: "categories",
    where: { id: { in: [...ids] } },
    depth: 0,
    limit: 0,
  });
  return docs.map((category) => `/blog/category/${category.slug}`);
};

const revalidatePost: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;

  const paths = new Set<string>();
  const categoryIds = new Set<number>();

  // New state: revalidate the current path only when the post is published and
  // has a slug. A slugless autosaved draft therefore revalidates nothing.
  const isPublished = doc?._status === "published" && Boolean(doc?.slug);
  if (isPublished) {
    paths.add(`/blog/${doc.slug}`);
    for (const id of toCategoryIds(doc.categories)) categoryIds.add(id);
  }

  // Old state: revalidate the previous path on unpublish (was published, now
  // not) or on a slug change (slug moved while published).
  const wasPublished = previousDoc?._status === "published" && Boolean(previousDoc?.slug);
  if (wasPublished && (!isPublished || previousDoc.slug !== doc.slug)) {
    paths.add(`/blog/${previousDoc.slug}`);
  }
  // Previous categories also need revalidating when the post was published, so a
  // post moving out of a category refreshes the archive it left behind.
  if (wasPublished) {
    for (const id of toCategoryIds(previousDoc.categories)) categoryIds.add(id);
  }

  if (paths.size > 0 || categoryIds.size > 0) {
    paths.add("/blog");
    paths.add("/sitemap.xml");
    for (const path of await categoryArchivePaths(payload, categoryIds)) paths.add(path);
  }

  deferRevalidate(payload, paths);
  return doc;
};

const revalidatePostDelete: CollectionAfterDeleteHook = async ({
  doc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;

  const paths = new Set<string>();
  const categoryIds = new Set<number>();
  if (doc?._status === "published" && doc?.slug) {
    paths.add(`/blog/${doc.slug}`);
    for (const id of toCategoryIds(doc.categories)) categoryIds.add(id);
  }

  if (paths.size > 0 || categoryIds.size > 0) {
    paths.add("/blog");
    paths.add("/sitemap.xml");
    for (const path of await categoryArchivePaths(payload, categoryIds)) paths.add(path);
  }

  deferRevalidate(payload, paths);
  return doc;
};

export const Posts: CollectionConfig = {
  slug: "posts",
  access: {
    // Anonymous visitors only see published docs; logged-in users see all.
    read: ({ req: { user } }) => {
      if (user) return true;
      return {
        _status: {
          equals: "published",
        },
      };
    },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "authors", "_status", "publishedAt"],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 800,
      },
    },
  },
  hooks: {
    afterChange: [revalidatePost],
    afterDelete: [revalidatePostDelete],
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
      name: "excerpt",
      type: "textarea",
    },
    {
      name: "content",
      type: "richText",
      editor: lexicalEditor({}),
    },
    {
      name: "heroImage",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "authors",
      type: "relationship",
      relationTo: "authors",
      hasMany: true,
    },
    {
      name: "categories",
      type: "relationship",
      relationTo: "categories",
      hasMany: true,
    },
    {
      name: "publishedAt",
      type: "date",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "featured",
      type: "checkbox",
      defaultValue: false,
    },
  ],
};
