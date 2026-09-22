import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { VisualLayer } from "@/lib/validations";
import type { BeatGridSpec } from "@/lib/render/beat-grid";
import { beatPeriodMs } from "@/lib/render/beat-grid";

/** How much the image swells on a beat, and how long the swell takes to fall away. */
const BEAT_PUNCH = 0.018;
const BEAT_DECAY_MS = 170;

/**
 * How far into the current beat we are, as 1 at the instant of the beat
 * falling to 0 over BEAT_DECAY_MS. Zero everywhere else, so the accent reads as
 * a pulse rather than a wobble.
 */
function beatPulse(absoluteMs: number, grid: BeatGridSpec): number {
  const period = beatPeriodMs(grid.bpm);
  if (!(period > 0)) return 0;
  const since = ((absoluteMs - grid.offsetMs) % period + period) % period;
  if (since >= BEAT_DECAY_MS) return 0;
  const t = since / BEAT_DECAY_MS;
  // Ease out: sharp attack on the beat, soft landing.
  return (1 - t) * (1 - t);
}

const KenBurns: React.FC<{ layer: VisualLayer; durationInFrames: number; startFrame: number; beatGrid: BeatGridSpec | null; children: React.ReactNode }> = ({ layer, durationInFrames, startFrame, beatGrid, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateRight: "clamp" });
  const drift = layer.kenBurns === "in" ? 1 + t * 0.12 : layer.kenBurns === "out" ? 1.12 - t * 0.12 : 1.08;
  // The sequence restarts the frame counter, so the beat needs the absolute time.
  const pulse = beatGrid ? beatPulse(((startFrame + frame) / fps) * 1000, beatGrid) : 0;
  const scale = drift + pulse * BEAT_PUNCH;
  const x = layer.kenBurns === "pan-left" ? -t * 4 : layer.kenBurns === "pan-right" ? t * 4 : 0;
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) * layer.opacity, transform: `scale(${scale}) translateX(${x}%)` }}>
      {children}
    </AbsoluteFill>
  );
};

export const VisualLayers: React.FC<{ layers: VisualLayer[]; beatGrid?: BeatGridSpec | null }> = ({ layers, beatGrid = null }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {layers.map((layer) => {
        const from = Math.round((layer.startMs / 1000) * fps);
        const duration = Math.max(1, Math.round(((layer.endMs - layer.startMs) / 1000) * fps));
        return (
          <Sequence key={layer.id} from={from} durationInFrames={duration} layout="none">
            <KenBurns layer={layer} durationInFrames={duration} startFrame={from} beatGrid={beatGrid}>
              {layer.type === "image" && layer.src && (
                <Img
                  src={layer.src}
                  style={{ width: "100%", height: "100%", objectFit: layer.fit }}
                  // A user's own upload is fetched from Supabase Storage, not a CDN
                  // built for hundreds of parallel readers — one Lambda invocation
                  // hitting a slow response looks identical to a broken file, so a
                  // single stalled fetch used to fail the whole render. Retrying
                  // it here costs nothing when the file is fine.
                  delayRenderRetries={3}
                  delayRenderTimeoutInMilliseconds={15000}
                />
              )}
              {layer.type === "video" && layer.src && (
                // Phone cameras record HDR, and Remotion tone-maps every extracted
                // frame by default — far too slow to finish inside a Lambda timeout.
                <OffthreadVideo
                  src={layer.src}
                  muted
                  toneMapped={false}
                  style={{ width: "100%", height: "100%", objectFit: layer.fit }}
                  delayRenderRetries={3}
                  delayRenderTimeoutInMilliseconds={15000}
                />
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
