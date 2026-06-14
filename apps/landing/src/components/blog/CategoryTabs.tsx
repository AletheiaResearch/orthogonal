import Link from "next/link";

import type { Category } from "@/payload-types";

function Tab({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "border-b-2 border-[#FF5C00] pb-1 font-semibold text-[#EDEBE6]"
          : "pb-1 text-[#EDEBE6]/55 transition-colors hover:text-[#EDEBE6]"
      }
    >
      {label}
    </Link>
  );
}

/** "All" + one tab per category. The active tab is underlined in the accent. */
export function CategoryTabs({
  categories,
  activeSlug,
}: {
  categories: Category[];
  activeSlug?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-5 text-sm">
      <Tab label="All" href="/blog" active={!activeSlug} />
      {categories.map((c) => (
        <Tab
          key={c.id}
          label={c.title}
          href={`/blog/category/${c.slug}`}
          active={c.slug === activeSlug}
        />
      ))}
    </nav>
  );
}
