import config from "@payload-config";
import { getPayload } from "payload";

import type { Category, Post } from "@/payload-types";

/** Published posts, newest first. Optionally filtered to a category slug. */
export async function getPublishedPosts(opts?: {
  limit?: number;
  categorySlug?: string;
}): Promise<Post[]> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "posts",
    where: {
      _status: { equals: "published" },
      ...(opts?.categorySlug ? { "categories.slug": { equals: opts.categorySlug } } : {}),
    },
    depth: 2, // populate heroImage, categories, authors + author avatars
    // publishedAt is optional; -createdAt breaks ties (incl. NULL publishedAt) for stable ordering.
    sort: ["-publishedAt", "-createdAt"],
    limit: opts?.limit ?? 0, // 0 = no limit
  });
  return docs;
}

/**
 * A single post by slug. When `draft` is true (live preview), the latest draft
 * is returned and the published-only access filter is bypassed.
 */
export async function getPostBySlug(slug: string, draft: boolean): Promise<Post | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "posts",
    depth: 2,
    draft,
    limit: 1,
    overrideAccess: draft,
    where: {
      slug: { equals: slug },
      ...(draft ? {} : { _status: { equals: "published" } }),
    },
  });
  return docs[0] ?? null;
}

/** All categories, alphabetical — drives the blog filter tabs. */
export async function getCategories(): Promise<Category[]> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "categories",
    depth: 0,
    limit: 0,
    sort: "title",
  });
  return docs;
}

/** A single category by slug (for archive pages). */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "categories",
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
  });
  return docs[0] ?? null;
}
