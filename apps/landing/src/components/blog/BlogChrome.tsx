const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Registration ticks marking the page's four corners — schematic edge markers,
// like the coming-soon page. They're `absolute` (not `fixed`) so they sit at the
// top and bottom of the page and scroll with it, rather than floating over the
// content. No grid backdrop: it clashed with the bordered sections (the
// "Featured" rule, card borders), so the corners carry the drafting language.
const CORNERS = [
  "top-4 left-4 border-t border-l",
  "top-4 right-4 border-t border-r",
  "bottom-4 left-4 border-b border-l",
  "bottom-4 right-4 border-b border-r",
];

/** Ambient chrome for every blog page: corner ticks + a faint film grain.
 *  Renders inside the layout's `relative` shell so the ticks pin to its corners. */
export function BlogChrome() {
  return (
    <>
      {CORNERS.map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={`pointer-events-none absolute z-30 size-3 border-[#EDEBE6]/20 ${pos}`}
        />
      ))}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
        style={{ backgroundImage: GRAIN }}
      />
    </>
  );
}
