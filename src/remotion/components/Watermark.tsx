import React from "react";
import { AbsoluteFill, Img } from "remotion";
import type { ShortVideoProps } from "@/lib/render/props";

export const Watermark: React.FC<{ watermark: NonNullable<ShortVideoProps["watermark"]>; scale: number }> = ({ watermark, scale }) => {
  const [v, h] = watermark.position.split("-");
  return (
    <AbsoluteFill
      style={{
        justifyContent: v === "top" ? "flex-start" : "flex-end",
        alignItems: h === "left" ? "flex-start" : "flex-end",
        padding: 56 * scale,
        opacity: watermark.opacity,
      }}
    >
      {watermark.imageUrl ? (
        <Img src={watermark.imageUrl} style={{ width: 200 * scale, height: "auto", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }} />
      ) : (
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 30 * scale,
            color: "white",
            padding: `${8 * scale}px ${18 * scale}px`,
            borderRadius: 999,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(8px)",
            letterSpacing: 0.5,
          }}
        >
          {watermark.text}
        </div>
      )}
    </AbsoluteFill>
  );
};
