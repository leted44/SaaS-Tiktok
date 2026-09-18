import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { VisualLayer } from "@/lib/validations";

const KenBurns: React.FC<{ layer: VisualLayer; durationInFrames: number; children: React.ReactNode }> = ({ layer, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateRight: "clamp" });
  const scale = layer.kenBurns === "in" ? 1 + t * 0.12 : layer.kenBurns === "out" ? 1.12 - t * 0.12 : 1.08;
  const x = layer.kenBurns === "pan-left" ? -t * 4 : layer.kenBurns === "pan-right" ? t * 4 : 0;
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) * layer.opacity, transform: `scale(${scale}) translateX(${x}%)` }}>
      {children}
    </AbsoluteFill>
  );
};

export const VisualLayers: React.FC<{ layers: VisualLayer[] }> = ({ layers }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {layers.map((layer) => {
        const from = Math.round((layer.startMs / 1000) * fps);
        const duration = Math.max(1, Math.round(((layer.endMs - layer.startMs) / 1000) * fps));
        return (
          <Sequence key={layer.id} from={from} durationInFrames={duration} layout="none">
            <KenBurns layer={layer} durationInFrames={duration}>
              {layer.type === "image" && layer.src && (
                <Img src={layer.src} style={{ width: "100%", height: "100%", objectFit: layer.fit }} />
              )}
              {layer.type === "video" && layer.src && (
                <OffthreadVideo src={layer.src} muted style={{ width: "100%", height: "100%", objectFit: layer.fit }} />
              )}
              {layer.type === "color" && <AbsoluteFill style={{ background: layer.color ?? "#000" }} />}
              {layer.type === "gradient" && (
                <AbsoluteFill style={{ background: `linear-gradient(160deg, ${(layer.gradient ?? ["#7C3AED", "#DB2777"]).join(", ")})` }} />
              )}
            </KenBurns>
          </Sequence>
        );
      })}
    </>
  );
};
