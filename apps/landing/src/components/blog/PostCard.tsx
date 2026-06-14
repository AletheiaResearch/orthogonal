import Link from "next/link";

import {
  formatDate,
  postAuthors,
  postCategories,
  postDate,
  postReadingTime,
} from "@/lib/post-helpers";
import type { Post } from "@/payload-types";

/**
 * A single editorial index row: date · category | serif title + dek | author ·
 * read-time. A row (not a card) is deliberate — it reads cleanly whether there
 * is one post or twenty, never looking like a half-empty card grid at n=1.
 */
export function PostCard({ post }: { post: Post }) {
  const category = postCategories(post)[0];
  const authors = postAuthors(post)
    .map((a) => a.name)
    .join(", ");

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group grid grid-cols-[1fr] items-baseline gap-x-10 gap-y-2 border-b border-[#EDEBE6]/10 py-7 transition-colors hover:bg-[#EDEBE6]/[0.02] sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:px-4"
    >
      <div className="font-mono text-xs text-[#EDEBE6]/45 sm:pt-2">
        <span className="tabular-nums">{formatDate(postDate(post))}</span>
        {category && (
          <>
            <br className="hidden sm:block" />
            <span className="text-[#FF5C00] sm:mt-1 sm:inline-block">{category.title}</span>
          </>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.015em] text-balance text-[#EDEBE6] transition-colors group-hover:text-[#FF5C00]">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[#EDEBE6]/50">
            {post.excerpt}
          </p>
        )}
      </div>

      <div className="hidden items-center gap-2 text-xs whitespace-nowrap text-[#EDEBE6]/45 sm:flex sm:pt-2">
        {authors && <span>{authors}</span>}
        {authors && <span className="text-[#EDEBE6]/30">·</span>}
        <span className="tabular-nums">{postReadingTime(post)} min</span>
      </div>
    </Link>
  );
}
