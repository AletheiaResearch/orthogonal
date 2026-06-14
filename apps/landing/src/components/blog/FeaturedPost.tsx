import Image from "next/image";
import Link from "next/link";

import { mediaAlt, mediaUrl } from "@/lib/media";
import {
  formatDate,
  postAuthors,
  postCategories,
  postDate,
  postReadingTime,
} from "@/lib/post-helpers";
import type { Post } from "@/payload-types";

/**
 * The lead piece, built as an asymmetric editorial spread.
 *
 * Left: an oversized Cormorant headline + dek — the composition's weight.
 * Right: a hairline-ruled "spec sheet" rail (Published / Reading / By) that
 * fills the width and makes the piece feel deliberate and composed even when
 * there is NO cover image (the binding n=1 case). The missing cover is treated
 * as an intentional editorial choice, not a hole.
 *
 * WITH a cover: the image leads the left column above the headline, so the
 * two-column structure and the spec rail are preserved either way.
 */
export function FeaturedPost({ post, solo = false }: { post: Post; solo?: boolean }) {
  const category = postCategories(post)[0];
  const cover = mediaUrl(post.heroImage, "card");
  const authors = postAuthors(post);
  const date = formatDate(postDate(post));
  const minutes = postReadingTime(post);

  // `solo` = this is the only post, so the hub centers it as an "issue cover".
  // Drop the bottom divider then — it would be a hairline rule to nowhere.
  return (
    <article className={solo ? "" : "border-b border-[#EDEBE6]/10 pb-14 lg:pb-20"}>
      {/* Section eyebrow with a full-width hairline. */}
      <div className="mb-8 flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.24em] text-[#EDEBE6]/40 uppercase">
          Featured
        </span>
        <span className="h-px flex-1 bg-[#EDEBE6]/10" />
        {category && (
          <span className="inline-block rounded-full bg-[#FF5C00] px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-[#101010] uppercase">
            {category.title}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left: image (if any) → headline → dek. */}
        <div className="min-w-0">
          <Link href={`/blog/${post.slug}`} className="group block">
            {cover && (
              <div className="relative mb-8 aspect-[16/9] w-full overflow-hidden rounded-xl ring-1 ring-[#EDEBE6]/[0.06]">
                <Image
                  src={cover}
                  alt={mediaAlt(post.heroImage) || post.title}
                  fill
                  priority
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                  sizes="(min-width: 1024px) 820px, 100vw"
                />
              </div>
            )}
            <h2 className="font-display text-6xl leading-[0.98] font-semibold tracking-[-0.02em] text-balance text-[#EDEBE6] transition-colors group-hover:text-[#FF5C00] sm:text-7xl lg:text-8xl">
              {post.title}
            </h2>
          </Link>

          {post.excerpt && (
            <p className="mt-7 max-w-[58ch] text-lg leading-relaxed text-[#EDEBE6]/60">
              {post.excerpt}
            </p>
          )}
        </div>

        {/* Right: the spec-sheet rail. A hairline on the left edge ties it to the
            headline and gives the schematic / official feel. */}
        <aside className="lg:border-l lg:border-[#EDEBE6]/10 lg:pl-10">
          <dl className="divide-y divide-[#EDEBE6]/10">
            <SpecRow label="Published" value={date} />
            <SpecRow label="Reading" value={`${minutes} min`} />
            <div className="flex items-start justify-between gap-6 py-4">
              <dt className="font-mono text-[10px] tracking-[0.2em] text-[#EDEBE6]/40 uppercase">
                By
              </dt>
              <dd className="flex items-center gap-2.5">
                {authors.length > 0 && (
                  <span className="flex items-center -space-x-2">
                    {authors.map((author) => {
                      const avatar = mediaUrl(author.avatar, "thumbnail");
                      return avatar ? (
                        <Image
                          key={author.id}
                          src={avatar}
                          alt={author.name}
                          width={22}
                          height={22}
                          className="size-[22px] rounded-full object-cover ring-1 ring-[#101010]"
                        />
                      ) : (
                        <span
                          key={author.id}
                          aria-hidden
                          className="size-[22px] rounded-full bg-gradient-to-br from-[#FF5C00] to-[#101010] ring-1 ring-[#101010]"
                        />
                      );
                    })}
                  </span>
                )}
                <span className="text-right text-sm text-[#EDEBE6]/75">
                  {authors.length > 0 ? authors.map((a) => a.name).join(", ") : "Orthogonal"}
                </span>
              </dd>
            </div>
          </dl>

          <Link
            href={`/blog/${post.slug}`}
            className="mt-7 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-[#EDEBE6]/55 uppercase transition-colors hover:text-[#FF5C00]"
          >
            Read piece <span aria-hidden>→</span>
          </Link>
        </aside>
      </div>
    </article>
  );
}

/** A single hairline-divided row in the spec rail. */
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-4">
      <dt className="font-mono text-[10px] tracking-[0.2em] text-[#EDEBE6]/40 uppercase">
        {label}
      </dt>
      <dd className="text-right text-sm text-[#EDEBE6]/75 tabular-nums">{value}</dd>
    </div>
  );
}
