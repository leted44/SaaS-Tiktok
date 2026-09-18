import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShortVideoProps } from "@/lib/render/props";
import { ensureFont } from "../fonts";

const Card: React.FC<{ text: string; accent: string; fontFamily: string; scale: number; durationInFrames: number }> = ({ text, accent, fontFamily, scale, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 240 * scale }}>
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

export const OnScreenText: React.FC<{ scenes: ShortVideoProps["scenes"]; accent: string; fontFamily: string; scale: number }> = ({ scenes, accent, fontFamily, scale }) => {
  const { fps } = useVideoConfig();
  ensureFont(fontFamily);
  return (
    <>
      {scenes
        .filter((s) => s.onScreenText)
        .map((s) => {
          const from = Math.round((s.startMs / 1000) * fps);
          const duration = Math.max(fps, Math.min(Math.round(((s.endMs - s.startMs) / 1000) * fps), fps * 3));
          return (
            <Sequence key={s.index} from={from} durationInFrames={duration} layout="none">
              <Card text={s.onScreenText!} accent={accent} fontFamily={fontFamily} scale={scale} durationInFrames={duration} />
            </Sequence>
          );
        })}
    </>
  );
};
