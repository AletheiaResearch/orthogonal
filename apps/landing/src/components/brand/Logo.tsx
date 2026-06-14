/** Isometric logomark — cream wireframe with the orange route. */
export function Mark({ className, animate = false }: { className?: string; animate?: boolean }) {
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
        {...(animate
          ? {
              pathLength: 1,
              style: {
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: "draw 1.6s ease-out 0.2s forwards",
              },
            }
          : {})}
      />
    </svg>
  );
}

/** ORTO wordmark — glyph-O · R · T · O. */
export function Wordmark({ className }: { className?: string }) {
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
