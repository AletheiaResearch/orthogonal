import { ImageResponse } from "next/og";

export const alt = "Orto — Build on every axis at once.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "Build on every axis at once.";

// Fetch a Google Font in a Satori-parseable format. The old UA makes Google
// serve ttf/woff (not woff2). We still pick the src by its declared format and
// only accept ttf/otf/woff — so an eot/woff2 response falls back to the default
// font instead of being handed to Satori, which would fail to parse it.
// Returns null on any failure so the build never breaks.
const SATORI_FONT_FORMAT = /\b(truetype|opentype|woff)\b/i;

async function loadCormorant(): Promise<ArrayBuffer | null> {
  try {
    const text = `${HEADLINE} ORTO Private beta · Coming soon`;
    const cssUrl = `https://fonts.googleapis.com/css2?family=Cormorant:wght@500&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1)" },
    }).then((r) => r.text());
    const src = [
      ...css.matchAll(/url\((https?:\/\/[^)]+)\)\s*format\(["']?([^"')]+)["']?\)/g),
    ].find((m) => SATORI_FONT_FORMAT.test(m[2]));
    if (!src) return null;
    return await fetch(src[1]).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const cormorant = await loadCormorant();
  const fonts = cormorant
    ? [{ name: "Cormorant", data: cormorant, weight: 500 as const, style: "normal" as const }]
    : undefined;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#101010",
        color: "#edebe6",
        padding: "72px 80px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 26, letterSpacing: "0.34em" }}>
        <div style={{ width: 15, height: 15, backgroundColor: "#ff5c00", marginRight: 18 }} />
        ORTO
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "Cormorant",
          fontSize: 98,
          lineHeight: 1.04,
          maxWidth: 940,
          letterSpacing: "-0.01em",
        }}
      >
        {HEADLINE}
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "rgba(237,235,230,0.55)" }}>
        Private beta · Coming soon
      </div>
    </div>,
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
