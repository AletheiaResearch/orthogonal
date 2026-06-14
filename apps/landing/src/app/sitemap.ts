import type { MetadataRoute } from "next";

import { getServerSideURL } from "@/lib/base-url";
import { getCategories, getPublishedPosts } from "@/lib/posts";
import { isIndexable } from "@/lib/seo";

/**
 * Sitemap of the blog. Cached by default; the Posts afterChange/afterDelete
 * hooks call revalidatePath('/sitemap.xml') so it stays fresh.
 *
 * Empty while the site is stealth (SITE_INDEXABLE unset) so a public sitemap
 * never advertises /blog before launch. Populates once indexing is enabled.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];

  const base = getServerSideURL();
  const [posts, categories] = await Promise.all([getPublishedPosts(), getCategories()]);

  return [
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8 },
    ...categories.map((category) => ({
      url: `${base}/blog/category/${category.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
