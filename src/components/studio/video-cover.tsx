import { headlineWords } from "@/components/carousel/slide";
import { COVER_BLOCK, COVER_SIZE, coverTitleSize, type CoverPosition } from "@/lib/video-cover";

/**
 * The video's cover as `next/og` draws it (see /api/projects/[id]/cover): the
 * image edge to edge, a soft shade behind the title only, and the title in
 * the carousel's poster face — white capitals, the surprising word in the
 * accent colour, flat and shadowed like the rest so it reads on any image.
 */
export function VideoCoverView({ imageSrc, title, emphasis, position, accent }: { imageSrc: string | null; title: string; emphasis: string; position: CoverPosition; accent: string }) {
  const { width, height } = COVER_SIZE;
  const block = COVER_BLOCK[position];
  const size = coverTitleSize(title);
  const lineHeight = 1.18;
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
            columnGap: Math.round(size * 0.22),
            fontFamily: "Anton",
            fontWeight: 400,
            fontSize: size,
            lineHeight,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#FFFFFF",
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
