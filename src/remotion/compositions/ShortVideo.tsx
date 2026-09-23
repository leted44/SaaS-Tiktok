import React from "react";
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShortVideoProps } from "@/lib/render/props";
import { Background } from "../components/Background";
import { VisualLayers } from "../components/VisualLayers";
import { KineticCaptions } from "../components/KineticCaptions";
import { OnScreenText } from "../components/OnScreenText";
import { Watermark } from "../components/Watermark";

const ProgressBar: React.FC<{ color: string; scale: number }> = ({ color, scale }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const w = interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end" }}>
      <div style={{ height: 8 * scale, width: `${w}%`, background: color, boxShadow: `0 0 ${12 * scale}px ${color}` }} />
    </AbsoluteFill>
  );
};

export const ShortVideo: React.FC<ShortVideoProps> = (props) => {
  const { width, durationInFrames, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const scale = width / 1080;
  const fadeOut = interpolate(frame, [durationInFrames - fps * 0.4, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeOut }}>
      <Background style={props.backgroundStyle} />
      <VisualLayers layers={props.visualLayers} beatGrid={props.beatGrid} />
      <OnScreenText scenes={props.scenes} accent={props.brand.accentColor} fontFamily={props.brand.fontFamily} scale={scale} captionPosition={props.captionStyle.position} />
      <KineticCaptions words={props.words} style={props.captionStyle} scale={scale} />
      <ProgressBar color={props.brand.primaryColor} scale={scale} />
      {props.watermark && <Watermark watermark={props.watermark} scale={scale} />}
      {props.voiceoverUrl && <Audio src={props.voiceoverUrl} />}
      {props.musicUrl && <Audio src={props.musicUrl} volume={props.musicVolume} trimBefore={Math.round((props.musicStartMs / 1000) * fps)} loop />}
    </AbsoluteFill>
  );
};
