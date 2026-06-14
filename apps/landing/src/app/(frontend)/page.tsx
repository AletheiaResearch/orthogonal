import { Mark, Wordmark } from "@/components/brand/Logo";

export default function Home() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col justify-between px-6 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12">
      {/* Faint orthogonal grid — radial-masked so it fades to nothing at the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(237,235,230,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(237,235,230,0.05) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 78% 62% at 50% 42%, #000 20%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 78% 62% at 50% 42%, #000 20%, transparent 80%)",
        }}
      />
      {/* Corner registration ticks */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-5 left-5 size-3 border-t border-l border-[#EDEBE6]/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-5 right-5 size-3 border-t border-r border-[#EDEBE6]/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-5 size-3 border-b border-l border-[#EDEBE6]/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-5 bottom-5 size-3 border-r border-b border-[#EDEBE6]/20"
      />
      {/* Film grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <header className="flex items-center gap-3">
        <Mark className="size-8" animate />
        <Wordmark className="h-5" />
      </header>

      <div className="flex flex-1 flex-col justify-center">
        <h1 className="max-w-3xl font-display text-6xl leading-[1.0] tracking-[-0.01em] text-balance sm:text-7xl lg:text-8xl">
          Build on every axis at once<span className="text-[#FF5C00]">.</span>
        </h1>
      </div>

      <footer className="flex items-center justify-between text-xs tracking-wide">
        <span className="font-sans text-[#EDEBE6]/55">Private beta · Coming soon</span>
        <span className="font-sans text-[#EDEBE6]/30 tabular-nums">
          © {new Date().getFullYear()}
        </span>
      </footer>
    </main>
  );
}
