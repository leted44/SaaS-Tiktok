import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { BackgroundStyle } from "@/lib/validations";

export const Background: React.FC<{ style: BackgroundStyle }> = ({ style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = style.colors.length >= 2 ? style.colors : [style.colors[0] ?? "#0B0714", "#3B0F7A"];
  const angle = interpolate(frame, [0, fps * 20], [135, 200], { extrapolateRight: "clamp" });

  const background =
    style.type === "solid"
      ? colors[0]
      : `linear-gradient(${angle}deg, ${colors.join(", ")})`;

  return (
    <AbsoluteFill style={{ background }}>
      {style.type !== "solid" && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at ${30 + Math.sin(frame / 60) * 15}% ${35 + Math.cos(frame / 80) * 10}%, rgba(255,255,255,0.14), transparent 55%)`,
          }}
        />
      )}
      {style.grain && (
        <AbsoluteFill
          style={{
            opacity: 0.12,
            mixBlendMode: "overlay",
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "200px 200px",
            transform: `translate(${(frame % 3) * 2}px, ${(frame % 5) * -1}px)`,
          }}
        />
      )}
      {style.vignette && (
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)" }} />
      )}
    </AbsoluteFill>
  );
};
