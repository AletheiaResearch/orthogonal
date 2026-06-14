import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CategoryTabs } from "@/components/blog/CategoryTabs";
import { PostList } from "@/components/blog/PostList";
import { getCategories, getCategoryBySlug, getPublishedPosts } from "@/lib/posts";
import { isIndexable } from "@/lib/seo";

type Args = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  return {
    title: category ? `${category.title} — Orthogonal Blog` : "Blog — Orthogonal",
    description: category?.description ?? undefined,
    robots: isIndexable() ? undefined : { index: false, follow: false },
  };
}

export default async function CategoryPage({ params }: Args) {
  const { slug } = await params;
  const [category, categories] = await Promise.all([getCategoryBySlug(slug), getCategories()]);
  if (!category) notFound();

  const posts = await getPublishedPosts({ categorySlug: slug });

  return (
    <>
      <header className="mb-6">
        <span className="font-mono text-[11px] tracking-[0.22em] text-[#FF5C00] uppercase">
          Category
        </span>
        <h1 className="mt-2 font-display text-4xl leading-tight font-semibold tracking-[-0.01em] text-[#EDEBE6] sm:text-5xl">
          {category.title}
        </h1>
        {category.description && (
          <p className="mt-3 max-w-2xl text-[#EDEBE6]/60">{category.description}</p>
        )}
      </header>

      <CategoryTabs categories={categories} activeSlug={slug} />
      <div className="mt-6">
        <PostList posts={posts} />
      </div>
    </>
  );
}
