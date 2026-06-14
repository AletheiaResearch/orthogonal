import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
  PayloadRequest,
} from "payload";

import { deferRevalidate } from "../lib/revalidate";

// Author edits change the byline rendered on every post they wrote, so collect
// the `/blog/<slug>` path of each published post referencing the author — plus
// the `/blog/category/<slug>` archives those posts appear on, which render the
// same byline via PostCard. The shared /blog + /sitemap.xml paths are only added
// when at least one such post exists, mirroring the empty-guard in the Posts hooks.
const collectAuthorPaths = async (
  payload: PayloadRequest["payload"],
  authorId: number | string
): Promise<Set<string>> => {
  const paths = new Set<string>();
  const { docs } = await payload.find({
    collection: "posts",
    where: {
      _status: { equals: "published" },
      authors: { in: [authorId] },
    },
    depth: 1, // populate categories so their archive pages can be revalidated too
    limit: 0,
  });
  for (const post of docs) {
    if (post.slug) paths.add(`/blog/${post.slug}`);
    for (const category of post.categories ?? []) {
      if (typeof category === "object" && category?.slug) {
        paths.add(`/blog/category/${category.slug}`);
      }
    }
  }
  if (paths.size > 0) {
    paths.add("/blog");
    paths.add("/sitemap.xml");
  }
  return paths;
};

const revalidateAuthor: CollectionAfterChangeHook = async ({ doc, req: { payload, context } }) => {
  if (context?.disableRevalidate) return doc;
  deferRevalidate(payload, await collectAuthorPaths(payload, doc.id));
  return doc;
};

// Capture the affected paths *before* deletion: once the author is gone the
// author->post relationship rows are too, so an afterDelete re-query would miss
// every `/blog/<slug>` page that referenced this author. Stash the Set on the
// shared request context for the matching afterDelete hook to consume.
const collectAuthorDeletePaths: CollectionBeforeDeleteHook = async ({
  id,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return;
  context.authorRevalidatePaths = await collectAuthorPaths(payload, id);
};

const revalidateAuthorDelete: CollectionAfterDeleteHook = async ({
  doc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;
  const paths = (context.authorRevalidatePaths as Set<string> | undefined) ?? new Set<string>();
  deferRevalidate(payload, paths);
  return doc;
};

export const Authors: CollectionConfig = {
  slug: "authors",
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "title"],
  },
  hooks: {
    afterChange: [revalidateAuthor],
    beforeDelete: [collectAuthorDeletePaths],
    afterDelete: [revalidateAuthorDelete],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "title", // optional job title / byline
      type: "text",
    },
    {
      name: "bio",
      type: "richText",
      editor: lexicalEditor({}),
    },
    {
      name: "avatar",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "user", // optional link to a Payload user
      type: "relationship",
      relationTo: "users",
    },
  ],
};
