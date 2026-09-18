import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionStyle, WordTiming } from "@/lib/validations";
import { paginateWords } from "@/lib/captions/align";
import { ensureFont } from "../fonts";

interface Props {
  words: WordTiming[];
  style: CaptionStyle;
  scale?: number; // resolution scale factor relative to 1080 wide
}

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const KineticCaptions: React.FC<Props> = ({ words, style, scale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  ensureFont(style.fontFamily);

  const pages = useMemo(() => paginateWords(words, style.wordsPerLine, style.maxLines), [words, style.wordsPerLine, style.maxLines]);
  const nowMs = (frame / fps) * 1000;
  const page = pages.find((p) => nowMs >= p.startMs && nowMs < p.endMs);
  if (!page) return null;

  const pageStartFrame = Math.round((page.startMs / 1000) * fps);
  // +1 so the very first frame of a page is never fully transparent when paused on a scene boundary.
  const enter = spring({ frame: frame - pageStartFrame + 1, fps, config: { damping: 14, stiffness: 180, mass: 0.6 } });
  const entrance =
    style.animation === "pop"
      ? { transform: `scale(${interpolate(enter, [0, 1], [0.8, 1])})`, opacity: enter }
      : style.animation === "slide"
        ? { transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`, opacity: enter }
        : style.animation === "fade"
          ? { opacity: interpolate(frame - pageStartFrame, [0, 6], [0, 1], { extrapolateRight: "clamp" }) }
          : {};

  const fontSize = style.fontSize * scale;
  const strokeWidth = style.strokeWidth * scale;
  const justify = style.position === "top" ? "flex-start" : style.position === "bottom" ? "flex-end" : "center";
  const paddingY = style.position === "center" ? 0 : 220 * scale;

  const textShadow = [
    style.strokeWidth > 0 ? `0 0 ${strokeWidth}px ${style.strokeColor}` : null,
    style.shadow ? `0 ${6 * scale}px ${18 * scale}px rgba(0,0,0,0.55)` : null,
    style.preset === "neon" ? `0 0 ${24 * scale}px ${hexToRgba(style.highlightColor, 0.7)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <AbsoluteFill style={{ justifyContent: justify, alignItems: "center", paddingTop: paddingY, paddingBottom: paddingY, transform: `translateY(${style.verticalOffset}%)` }}>
      <div
        style={{
          ...entrance,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.15 * fontSize,
          padding: `${0.35 * fontSize}px ${0.5 * fontSize}px`,
          borderRadius: 0.3 * fontSize,
          background: style.backgroundColor ? hexToRgba(style.backgroundColor, style.backgroundOpacity) : "transparent",
          maxWidth: "90%",
        }}
      >
        {page.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 0.28 * fontSize }}>
            {line.words.map((w, wi) => {
              const active = nowMs >= w.startMs && nowMs < w.endMs;
              const spoken = nowMs >= w.endMs;
              const wordFrame = Math.round((w.startMs / 1000) * fps);
              const pop = active && style.highlightMode === "scale" ? spring({ frame: frame - wordFrame, fps, config: { damping: 10, stiffness: 260 } }) : 0;
              const isKaraoke = style.preset === "karaoke";
              const color = active || (isKaraoke && spoken) ? (style.highlightMode === "color" ? style.highlightColor : style.textColor) : style.textColor;
              const text = style.uppercase ? w.word.toUpperCase() : w.word;
              return (
                <span
                  key={wi}
                  style={{
                    fontFamily: `"${style.fontFamily}", Inter, system-ui, sans-serif`,
                    fontSize,
                    fontWeight: style.fontWeight,
                    lineHeight: 1.15,
                    color,
                    WebkitTextStroke: style.strokeWidth > 0 ? `${Math.max(1, strokeWidth * 0.45)}px ${style.strokeColor}` : undefined,
                    paintOrder: "stroke fill",
                    textShadow,
                    letterSpacing: style.uppercase ? 0.01 * fontSize : 0,
                    display: "inline-block",
                    padding: style.highlightMode === "box" ? `0 ${0.15 * fontSize}px` : 0,
                    borderRadius: 0.15 * fontSize,
                    background: active && style.highlightMode === "box" ? style.highlightColor : "transparent",
                    textDecoration: active && style.highlightMode === "underline" ? "underline" : "none",
                    textDecorationColor: style.highlightColor,
                    textDecorationThickness: 0.08 * fontSize,
                    textUnderlineOffset: 0.12 * fontSize,
                    transform: active && style.highlightMode === "scale" ? `scale(${1 + pop * 0.18})` : "scale(1)",
                    transition: "background 60ms linear",
                    opacity: !active && !spoken && isKaraoke ? 0.72 : 1,
                  }}
                >
                  {text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
