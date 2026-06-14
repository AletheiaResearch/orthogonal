import { ImageResponse } from "next/og";

export const alt = "Orto — Build on every axis at once.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "Build on every axis at once.";

// Fetch a TTF from Google Fonts (old UA forces ttf over woff2, which Satori
// can't read). Subsetted to the glyphs we render. Returns null on any failure
// so the build falls back to the default font instead of breaking.
async function loadCormorant(): Promise<ArrayBuffer | null> {
  try {
    const text = `${HEADLINE} ORTO Private beta · Coming soon`;
    const cssUrl = `https://fonts.googleapis.com/css2?family=Cormorant:wght@500&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1)" },
    }).then((r) => r.text());
    const url = css.match(/src:\s*url\((.+?)\)\s*format/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
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
