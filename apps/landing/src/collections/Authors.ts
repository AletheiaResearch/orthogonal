import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  PayloadRequest,
} from "payload";

import { deferRevalidate } from "../lib/revalidate";

// Author edits change the byline rendered on every post they wrote, so collect
// the `/blog/<slug>` path of each published post referencing the author. The
// shared /blog + /sitemap.xml paths are only added when at least one such post
// exists, mirroring the empty-guard in the Posts hooks.
const collectAuthorPaths = async (
  payload: PayloadRequest["payload"],
  authorId: number
): Promise<Set<string>> => {
  const paths = new Set<string>();
  const { docs } = await payload.find({
    collection: "posts",
    where: {
      _status: { equals: "published" },
      authors: { in: [authorId] },
    },
    depth: 0,
    limit: 0,
  });
  for (const post of docs) {
    if (post.slug) paths.add(`/blog/${post.slug}`);
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

const revalidateAuthorDelete: CollectionAfterDeleteHook = async ({
  doc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;
  deferRevalidate(payload, await collectAuthorPaths(payload, doc.id));
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
