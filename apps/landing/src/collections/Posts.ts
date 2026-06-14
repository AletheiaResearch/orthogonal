import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  PayloadRequest,
} from "payload";

import { formatSlugHook, validateSlug } from "../fields/slug";

// Schedules revalidation to run *after* the response so it never executes during
// the admin's RSC render (Next 16 throws if revalidatePath runs during render).
// after() throws when called outside a request scope, so writes that bypass the
// disableRevalidate guard (e.g. migrations/jobs) are caught here instead of crashing.
const deferRevalidate = (payload: PayloadRequest["payload"], paths: Set<string>) => {
  if (paths.size === 0) return;
  try {
    after(() => {
      for (const path of paths) {
        payload.logger.info(`Revalidating path: ${path}`);
        revalidatePath(path);
      }
    });
  } catch {
    payload.logger.warn("Skipping post revalidation: called outside a request scope");
  }
};

const revalidatePost: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (context?.disableRevalidate) return doc;

  const paths = new Set<string>();

  // New state: revalidate the current path only when the post is published and
  // has a slug. A slugless autosaved draft therefore revalidates nothing.
  const isPublished = doc?._status === "published" && Boolean(doc?.slug);
  if (isPublished) paths.add(`/blog/${doc.slug}`);

  // Old state: revalidate the previous path on unpublish (was published, now
  // not) or on a slug change (slug moved while published).
  const wasPublished = previousDoc?._status === "published" && Boolean(previousDoc?.slug);
  if (wasPublished && (!isPublished || previousDoc.slug !== doc.slug)) {
    paths.add(`/blog/${previousDoc.slug}`);
  }

  if (paths.size > 0) {
    paths.add("/blog");
    paths.add("/sitemap.xml");
  }

  deferRevalidate(payload, paths);
  return doc;
};

const revalidatePostDelete: CollectionAfterDeleteHook = ({ doc, req: { payload, context } }) => {
  if (context?.disableRevalidate) return doc;

  const paths = new Set<string>();
  if (doc?._status === "published" && doc?.slug) paths.add(`/blog/${doc.slug}`);

  if (paths.size > 0) {
    paths.add("/blog");
    paths.add("/sitemap.xml");
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
        interval: 375,
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
