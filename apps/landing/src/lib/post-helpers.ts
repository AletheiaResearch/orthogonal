import type { Author, Category, Post } from "@/payload-types";

import { lexicalToPlainText } from "./lexical-text";
import { readingTimeMinutes } from "./reading-time";

/** Populated authors on a post (filters out unpopulated id references). */
export function postAuthors(post: Post): Author[] {
  return (post.authors ?? []).filter((a): a is Author => typeof a === "object" && a !== null);
}

/** Populated categories on a post (filters out unpopulated id references). */
export function postCategories(post: Post): Category[] {
  return (post.categories ?? []).filter((c): c is Category => typeof c === "object" && c !== null);
}

/** Estimated reading time in minutes, derived from the post body. */
export function postReadingTime(post: Post): number {
  return readingTimeMinutes(lexicalToPlainText(post.content));
}

/** Display date for a post (publish date, falling back to creation date). */
export function postDate(post: Post): string {
  return post.publishedAt ?? post.createdAt;
}

/** Format an ISO date as e.g. "Jun 12, 2026". */
export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
