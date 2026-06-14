/** Isometric logomark — cream wireframe with the orange route. */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" fill="none" className={className} aria-hidden>
      <g stroke="#EDEBE6" strokeWidth={4}>
        <path d="M206.3 244.9 L366.5 337.4 L206.3 429.9 L46.1 337.4 Z" />
        <path d="M206.3 59.9 L366.5 152.4 L206.3 244.9 L46.1 152.4 Z" />
        <path d="M206.3 244.9 L206.3 59.9 M366.5 337.4 L366.5 152.4 M206.3 429.9 L206.3 244.9 M46.1 337.4 L46.1 152.4" />
      </g>
      <g stroke="#EDEBE6" strokeWidth={3.4}>
        <path d="M366.5 337.4 L465.8 394.8 L366.5 452.1 L267.2 394.8 Z" />
        <path d="M366.5 222.7 L465.8 280.1 L366.5 337.4 L267.2 280.1 Z" />
        <path d="M366.5 337.4 L366.5 222.7 M465.8 394.8 L465.8 280.1 M366.5 452.1 L366.5 337.4 M267.2 394.8 L267.2 280.1" />
      </g>
      <g stroke="#EDEBE6" strokeWidth={2.8}>
        <path d="M405 244.9 L465.8 280.1 L405 315.2 L344.1 280.1 Z" />
        <path d="M405 174.6 L465.8 209.8 L405 244.9 L344.1 209.8 Z" />
        <path d="M405 244.9 L405 174.6 M465.8 280.1 L465.8 209.8 M405 315.2 L405 244.9 M344.1 280.1 L344.1 209.8" />
      </g>
      <path
        d="M206.3 59.9 L206.3 244.9 L465.8 394.8 L465.8 209.8 L366.5 152.4 L366.5 222.7 L405 244.9 L405 217.9"
        stroke="#FF5C00"
        strokeWidth={10}
        strokeLinejoin="miter"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 1,
          animation: "draw 1.6s ease-out 0.2s forwards",
        }}
      />
    </svg>
  );
}

/** ORTO wordmark — glyph-O · R · T · O. */
function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="205 109 270 82" fill="none" className={className} aria-hidden>
      {/* O — glyph */}
      <path d="M211 121 L253 121 L253 179 L211 179 L211 160" stroke="#EDEBE6" strokeWidth={12} />
      <path d="M211 160 L211 141 L229 141" stroke="#FF5C00" strokeWidth={12} />
      {/* R */}
      <g fill="#EDEBE6">
        <rect x="281" y="115" width="12" height="70" />
        <rect x="281" y="115" width="50" height="12" />
        <rect x="319" y="115" width="12" height="40" />
        <rect x="281" y="143" width="50" height="12" />
        <rect x="305" y="155" width="14" height="15" />
        <rect x="313" y="170" width="18" height="15" />
        {/* T */}
        <rect x="353" y="115" width="50" height="12" />
        <rect x="372" y="115" width="12" height="70" />
      </g>
      {/* O */}
      <rect x="431" y="121" width="38" height="58" stroke="#EDEBE6" strokeWidth={12} />
    </svg>
  );
}

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
        <Mark className="size-8" />
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
