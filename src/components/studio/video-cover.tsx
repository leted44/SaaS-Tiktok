import { headlineWords } from "@/components/carousel/slide";
import { COVER_BLOCK, COVER_FONTS, COVER_SIZE, coverTitleSize, type CoverFont, type CoverPosition } from "@/lib/video-cover";

/**
 * The video's cover as `next/og` draws it (see /api/projects/[id]/cover): the
 * image edge to edge, a soft shade behind the title only, and the title in
 * face and colour picked for it, the surprising word in its own colour, flat
 * and shadowed like the rest so it reads on any image.
 */
export function VideoCoverView({ imageSrc, title, emphasis, position, accent, color, font }: { imageSrc: string | null; title: string; emphasis: string; position: CoverPosition; accent: string; color: string; font: CoverFont }) {
  const face = COVER_FONTS[font];
  const { width, height } = COVER_SIZE;
  const block = COVER_BLOCK[position];
  const size = Math.round(coverTitleSize(title) * face.scale);
  const lineHeight = face.lineHeight;
  const pct = (y: number) => `${Math.max(0, Math.min(100, (y / height) * 100)).toFixed(1)}%`;
  // Darkens only around the title, so the image keeps its light everywhere else.
  const scrim = `linear-gradient(180deg, rgba(0,0,0,0) ${pct(block.top - 260)}, rgba(0,0,0,0.5) ${pct(block.top + 60)}, rgba(0,0,0,0.5) ${pct(block.top + block.height - 60)}, rgba(0,0,0,0) ${pct(block.top + block.height + 260)})`;
  const shadow = "0 6px 28px rgba(0,0,0,0.75), 0 2px 6px rgba(0,0,0,0.6)";

  return (
    <div style={{ display: "flex", position: "relative", width, height, background: "#120A08" }}>
      {imageSrc && (
        <img src={imageSrc} alt="" width={width} height={height} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />
      )}
      <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundImage: scrim }} />
      <div style={{ display: "flex", position: "absolute", left: 0, top: block.top, width, height: block.height, alignItems: "center", justifyContent: "center", padding: "0 64px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            columnGap: Math.round(size * face.gap),
            fontFamily: face.family,
            fontWeight: face.weight,
            fontSize: size,
            lineHeight,
            letterSpacing: 1,
            textTransform: face.upper ? "uppercase" : "none",
            textAlign: "center",
            color,
            textShadow: shadow,
          }}
        >
          {headlineWords(title, emphasis).map((segments, i) => (
            <div key={i} style={{ display: "flex" }}>
              {segments.map((s, j) =>
                s.hot ? (
                  <span key={j} style={{ lineHeight, color: accent }}>
                    {s.text}
                  </span>
                ) : (
                  <span key={j} style={{ lineHeight }}>
                    {s.text}
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
