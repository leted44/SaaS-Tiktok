import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShortVideoProps } from "@/lib/render/props";
import type { CaptionStyle } from "@/lib/validations";
import { ensureFont } from "../fonts";

/**
 * The captions own whichever band the user picked, so the card takes a free one:
 * it drops below a top-aligned caption block instead of printing on top of it.
 * Kept well above the bottom quarter, which TikTok and Reels cover with their
 * own description and action buttons.
 */
const CARD_TOP: Record<CaptionStyle["position"], number> = { top: 720, center: 240, bottom: 240 };

const Card: React.FC<{ text: string; accent: string; fontFamily: string; scale: number; durationInFrames: number; top: number }> = ({ text, accent, fontFamily, scale, durationInFrames, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: top * scale }}>
      <div
        style={{
          opacity: Math.min(enter, exit),
          transform: `translateY(${interpolate(enter, [0, 1], [-40, 0])}px) rotate(-2deg)`,
          background: accent,
          color: "#0B0714",
          fontFamily: `"${fontFamily}", Inter, sans-serif`,
          fontWeight: 900,
          fontSize: 54 * scale,
          padding: `${14 * scale}px ${30 * scale}px`,
          borderRadius: 18 * scale,
          boxShadow: `0 ${12 * scale}px ${40 * scale}px rgba(0,0,0,0.45)`,
          textTransform: "uppercase",
          letterSpacing: 1 * scale,
          maxWidth: "85%",
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const OnScreenText: React.FC<{ scenes: ShortVideoProps["scenes"]; accent: string; fontFamily: string; scale: number; captionPosition: CaptionStyle["position"] }> = ({ scenes, accent, fontFamily, scale, captionPosition }) => {
  const { fps } = useVideoConfig();
  ensureFont(fontFamily);
  const top = CARD_TOP[captionPosition];
  return (
    <>
      {scenes
        .filter((s) => s.onScreenText)
        .map((s) => {
          const from = Math.round((s.startMs / 1000) * fps);
          const duration = Math.max(fps, Math.min(Math.round(((s.endMs - s.startMs) / 1000) * fps), fps * 3));
          return (
            <Sequence key={s.index} from={from} durationInFrames={duration} layout="none">
              <Card text={s.onScreenText!} accent={accent} fontFamily={fontFamily} scale={scale} durationInFrames={duration} top={top} />
            </Sequence>
          );
        })}
    </>
  );
};
