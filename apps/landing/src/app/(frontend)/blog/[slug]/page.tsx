import type { DefaultTypedEditorState } from "@payloadcms/richtext-lexical";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { AuthorByline } from "@/components/blog/AuthorByline";
import { RefreshRouteOnSave } from "@/components/RefreshRouteOnSave";
import RichText from "@/components/RichText";
import { getServerSideURL } from "@/lib/base-url";
import { absoluteMediaUrl, mediaAlt, mediaUrl } from "@/lib/media";
import { postCategories } from "@/lib/post-helpers";
import { getPostBySlug, getPublishedPosts } from "@/lib/posts";
import { isIndexable } from "@/lib/seo";

type Args = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params;
  const { isEnabled: draft } = await draftMode();
  const post = await getPostBySlug(slug, draft);
  if (!post) return {};

  const title = post.meta?.title || post.title;
  const description = post.meta?.description || post.excerpt || undefined;
  const ogImage =
    absoluteMediaUrl(post.meta?.image, "og") ?? absoluteMediaUrl(post.heroImage, "og");

  return {
    title,
    description,
    robots: isIndexable() ? undefined : { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${getServerSideURL()}/blog/${slug}`,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}

export default async function PostPage({ params }: Args) {
  const { slug } = await params;
  const { isEnabled: draft } = await draftMode();
  const post = await getPostBySlug(slug, draft);
  if (!post) notFound();

  const category = postCategories(post)[0];
  const cover = mediaUrl(post.heroImage, "card");

  return (
    <Fragment>
      {draft && <RefreshRouteOnSave />}
      <article className="mx-auto max-w-[720px]">
        <Link
          href="/blog"
          className="font-mono text-[11px] tracking-[0.18em] text-[#EDEBE6]/45 uppercase transition-colors hover:text-[#FF5C00]"
        >
          ← Writing
        </Link>

        <div className="mt-8">
          {category && (
            <span className="inline-block rounded-full bg-[#FF5C00] px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-[#101010] uppercase">
              {category.title}
            </span>
          )}
          <h1 className="mt-4 font-display text-5xl leading-[1.02] font-semibold tracking-[-0.015em] text-[#EDEBE6] sm:text-6xl">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-5 text-xl leading-relaxed text-[#EDEBE6]/60">{post.excerpt}</p>
          )}
          <div className="mt-6">
            <AuthorByline post={post} />
          </div>
        </div>

        {cover && (
          <div className="relative mt-10 aspect-[16/9] w-full overflow-hidden rounded-xl ring-1 ring-[#EDEBE6]/[0.06]">
            <Image
              src={cover}
              alt={mediaAlt(post.heroImage) || post.title}
              fill
              priority
              className="object-cover"
              sizes="(min-width: 768px) 720px, 100vw"
            />
          </div>
        )}

        {post.content && (
          <div className="prose mt-12 max-w-none prose-invert prose-headings:font-display prose-headings:font-medium prose-headings:tracking-tight prose-a:text-[#FF5C00] prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl">
            <RichText data={post.content as DefaultTypedEditorState} />
          </div>
        )}

        <div className="mt-16 border-t border-[#EDEBE6]/10 pt-8">
          <Link
            href="/blog"
            className="font-mono text-sm text-[#EDEBE6]/55 transition-colors hover:text-[#FF5C00]"
          >
            ← All writing
          </Link>
        </div>
      </article>
    </Fragment>
  );
}
