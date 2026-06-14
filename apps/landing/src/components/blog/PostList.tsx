import type { Post } from "@/payload-types";

import { PostCard } from "./PostCard";

/**
 * The editorial index — a single column of ruled rows that holds at one row or
 * many. A single top hairline frames it; each row carries its own bottom rule.
 * No section label: the page above (featured + tabs, or the category title +
 * tabs) is the heading, so a second one would just be noise.
 */
export function PostList({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-3xl text-[#EDEBE6]/60">Nothing published yet.</p>
        <p className="mt-3 font-mono text-xs tracking-[0.18em] text-[#EDEBE6]/40 uppercase">
          Check back soon
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-[#EDEBE6]/10">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
