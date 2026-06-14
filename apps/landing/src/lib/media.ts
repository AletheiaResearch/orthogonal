import type { Media } from "@/payload-types";

import { getServerSideURL } from "./base-url";

type MediaRef = number | Media | null | undefined;

/**
 * URL for a populated Media relationship, as stored (relative for local media,
 * e.g. /api/media/file/...). Pass a `size` to prefer a generated variant.
 * Suitable for next/image (matches the configured localPatterns). Returns
 * undefined when the relationship isn't populated (depth too low) or has no file.
 */
export function mediaUrl(image: MediaRef, size?: "thumbnail" | "card" | "og"): string | undefined {
  if (!image || typeof image !== "object") return undefined;
  const sized = size ? image.sizes?.[size]?.url : undefined;
  return sized ?? image.url ?? undefined;
}

/** Absolute URL for a Media relationship — used for OG images / canonical metadata. */
export function absoluteMediaUrl(
  image: MediaRef,
  size?: "thumbnail" | "card" | "og"
): string | undefined {
  const rel = mediaUrl(image, size);
  if (!rel) return undefined;
  return rel.startsWith("http") ? rel : `${getServerSideURL()}${rel}`;
}

/** Alt text for a populated Media relationship (empty string when unpopulated). */
export function mediaAlt(image: MediaRef): string {
  return image && typeof image === "object" ? image.alt : "";
}
