import type { Metadata } from "next";

import { CategoryTabs } from "@/components/blog/CategoryTabs";
import { FeaturedPost } from "@/components/blog/FeaturedPost";
import { PostList } from "@/components/blog/PostList";
import { getCategories, getPublishedPosts } from "@/lib/posts";
import { isIndexable } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Blog — Orthogonal",
    description: "Writing, news, and notes from the Orthogonal team.",
    robots: isIndexable() ? undefined : { index: false, follow: false },
  };
}

export default async function BlogIndexPage() {
  const [posts, categories] = await Promise.all([getPublishedPosts(), getCategories()]);
  const featured = posts.find((post) => post.featured) ?? posts[0];
  const rest = featured ? posts.filter((post) => post.id !== featured.id) : [];

  // Empty + single-post hubs vertically center their content so the page fills
  // the viewport ("issue cover") instead of stranding the footer under a slab of
  // black. `min-h-full` fills <main>'s flex-1 height; it grows past it if needed.
  if (!featured) {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <PostList posts={[]} />
      </div>
    );
  }

  if (rest.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <FeaturedPost post={featured} solo />
      </div>
    );
  }

  // More than the featured post: lead with it, then the tabs + index.
  return (
    <>
      <FeaturedPost post={featured} />
      {categories.length > 0 && (
        <div className="mt-14">
          <CategoryTabs categories={categories} />
        </div>
      )}
      <div className={categories.length > 0 ? "mt-6" : "mt-14"}>
        <PostList posts={rest} />
      </div>
    </>
  );
}
