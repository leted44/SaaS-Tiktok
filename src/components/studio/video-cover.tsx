import type { CSSProperties } from "react";
import { headlineWords } from "@/components/carousel/slide";
import { COVER_BLOCK, COVER_FONTS, COVER_SIZE, coverTitleSize, isDarkInk, type CoverEffect, type CoverFont, type CoverPosition } from "@/lib/video-cover";

/**
 * The video's cover as `next/og` draws it (see /api/projects/[id]/cover): the
 * image edge to edge, a soft band behind the title only, and the title in the
 * face, colours and effect picked for it (lib/video-cover COVER_STYLES).
 *
 * The band follows the ink: dark under a light title, light under a black
 * one, so either reads on any picture.
 */
export function VideoCoverView({ imageSrc, title, emphasis, position, accent, color, font, effect, family }: {
  imageSrc: string | null;
  title: string;
  emphasis: string;
  position: CoverPosition;
  accent: string;
  color: string;
  font: CoverFont;
  effect: CoverEffect;
  /** The CSS family to set the face with — the browser preview's, whose loaded fonts have their own names. */
  family?: string;
}) {
  const face = COVER_FONTS[font];
  const { width, height } = COVER_SIZE;
  const block = COVER_BLOCK[position];
  const size = Math.round(coverTitleSize(title) * face.scale);
  const lineHeight = face.lineHeight;
  const dark = isDarkInk(color);
  const band = dark ? "255,255,255" : "0,0,0";
  const pct = (y: number) => `${Math.max(0, Math.min(100, (y / height) * 100)).toFixed(1)}%`;
  // Only around the title, so the picture keeps its light everywhere else. The box effect brings its own.
  const scrim =
    effect === "box"
      ? null
      : `linear-gradient(180deg, rgba(${band},0) ${pct(block.top - 260)}, rgba(${band},${dark ? 0.62 : 0.5}) ${pct(block.top + 60)}, rgba(${band},${dark ? 0.62 : 0.5}) ${pct(block.top + block.height - 60)}, rgba(${band},0) ${pct(block.top + block.height + 260)})`;

  const halo = dark ? "255,255,255" : "0,0,0";
  const outline = (w: number) =>
    [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.3], [0, 1.3], [-1.3, 0], [1.3, 0]].map(([x, y]) => `${Math.round(x * w)}px ${Math.round(y * w)}px 0 rgba(${halo},0.95)`).join(", ");
  const shadowFor = (ink: string): string =>
    effect === "outline"
      ? `${outline(Math.max(4, Math.round(size * 0.045)))}, 0 8px 24px rgba(${halo},0.5)`
      : effect === "glow"
        ? `0 0 ${Math.round(size * 0.12)}px ${ink}, 0 0 ${Math.round(size * 0.3)}px ${ink}, 0 4px 12px rgba(0,0,0,0.6)`
        : effect === "box"
          ? "none"
          : `0 6px 28px rgba(${halo},0.75), 0 2px 6px rgba(${halo},0.6)`;

  const textStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: Math.round(size * face.gap),
    rowGap: effect === "box" ? Math.round(size * 0.12) : 0,
    fontFamily: family ?? face.family,
    fontWeight: face.weight,
    fontSize: size,
    lineHeight,
    letterSpacing: 1,
    textTransform: face.upper ? "uppercase" : "none",
    textAlign: "center",
    color,
    textShadow: shadowFor(color),
  };
  const boxPad = `${Math.round(size * 0.04)}px ${Math.round(size * 0.16)}px`;

  return (
    <div style={{ display: "flex", position: "relative", width, height, background: "#120A08" }}>
      {imageSrc && <img src={imageSrc} alt="" width={width} height={height} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />}
      {scrim && <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundImage: scrim }} />}
      <div style={{ display: "flex", position: "absolute", left: 0, top: block.top, width, height: block.height, alignItems: "center", justifyContent: "center", padding: "0 64px" }}>
        <div style={effect === "box" ? { display: "flex", padding: `${Math.round(size * 0.22)}px ${Math.round(size * 0.24)}px`, borderRadius: Math.round(size * 0.22), background: `rgba(${band},${dark ? 0.82 : 0.6})` } : { display: "flex" }}>
          <div style={textStyle}>
            {headlineWords(title, emphasis).map((segments, i) => (
              <div key={i} style={{ display: "flex" }}>
                {segments.map((s, j) =>
                  s.hot ? (
                    effect === "box" ? (
                      <span key={j} style={{ display: "flex", lineHeight, padding: boxPad, borderRadius: Math.round(size * 0.12), background: accent, color: isDarkInk(accent) ? "#FFFFFF" : "#111111" }}>
                        {s.text}
                      </span>
                    ) : (
                      <span key={j} style={{ lineHeight, color: accent, textShadow: shadowFor(accent) }}>
                        {s.text}
                      </span>
                    )
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
    </div>
  );
}
