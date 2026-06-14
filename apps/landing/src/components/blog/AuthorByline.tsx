import Image from "next/image";

import { mediaUrl } from "@/lib/media";
import { formatDate, postAuthors, postDate, postReadingTime } from "@/lib/post-helpers";
import type { Post } from "@/payload-types";

/** Author avatar(s) + name(s) · date · reading time. */
export function AuthorByline({ post }: { post: Post }) {
  const authors = postAuthors(post);
  const date = formatDate(postDate(post));
  const minutes = postReadingTime(post);

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-[#EDEBE6]/55">
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
      {authors.length > 0 && (
        <span className="text-[#EDEBE6]/75">{authors.map((a) => a.name).join(", ")}</span>
      )}
      {date && (
        <>
          <span className="text-[#EDEBE6]/30">·</span>
          <span>{date}</span>
        </>
      )}
      <span className="text-[#EDEBE6]/30">·</span>
      <span>{minutes} min read</span>
    </div>
  );
}
