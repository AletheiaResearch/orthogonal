import Link from "next/link";

import { BlogChrome } from "@/components/blog/BlogChrome";
import { Mark, Wordmark } from "@/components/brand/Logo";

/**
 * Shared chrome + shell for every blog page (hub, post, category).
 *
 * Structure echoes Cursor: a full-bleed masthead band with the ORTO logo
 * anchored to the page edge (not buried inside a centered text column), a wide
 * editorial content measure (~1180), and a full-bleed footer that — together
 * with `flex-1` on <main> — pins the bottom of the page. That `flex-1` is the
 * anti-barren lever: with a single text-only post the footer still sits at the
 * bottom of a 16" viewport instead of leaving a slab of dead black.
 *
 * The masthead/footer go edge-to-edge; only the content is constrained. The
 * post detail page sets its own ~720px prose measure internally, so the wider
 * container here never widens long-form body text.
 */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <BlogChrome />

      {/* Full-bleed masthead — logo anchored to the page edge, linking home. */}
      <header className="relative z-10 border-b border-[#EDEBE6]/10">
        <div className="flex items-center justify-between px-6 py-6 sm:px-10 lg:px-16">
          <Link
            href="/"
            aria-label="Orthogonal home"
            className="flex items-center gap-3 opacity-90 transition-opacity hover:opacity-100"
          >
            <Mark className="size-7" />
            <Wordmark className="h-[18px]" />
          </Link>
          <span className="font-mono text-[11px] tracking-[0.22em] text-[#EDEBE6]/40 uppercase">
            Writing
          </span>
        </div>
      </header>

      {/* Wide editorial measure. `flex-1` lets the page own the vertical space. */}
      <main className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-6 py-14 sm:px-10 lg:px-16 lg:py-20">
        {children}
      </main>

      {/* Full-bleed footer — anchors the bottom, echoes the home page. */}
      <footer className="relative z-10 border-t border-[#EDEBE6]/10">
        <div className="flex items-center justify-between px-6 py-6 text-xs tracking-wide sm:px-10 lg:px-16">
          <span className="font-sans text-[#EDEBE6]/55">Private beta · Coming soon</span>
          <span className="font-sans text-[#EDEBE6]/30 tabular-nums">
            © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
