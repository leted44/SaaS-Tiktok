import React from "react";
import { Composition } from "remotion";
import { ShortVideo } from "./compositions/ShortVideo";
import { DEFAULT_PREVIEW_PROPS, shortVideoPropsSchema, type ShortVideoProps } from "@/lib/render/props";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ShortVideo"
      component={ShortVideo}
      schema={shortVideoPropsSchema}
      defaultProps={DEFAULT_PREVIEW_PROPS}
      durationInFrames={Math.round((DEFAULT_PREVIEW_PROPS.durationMs / 1000) * DEFAULT_PREVIEW_PROPS.fps)}
      fps={DEFAULT_PREVIEW_PROPS.fps}
      width={DEFAULT_PREVIEW_PROPS.width}
      height={DEFAULT_PREVIEW_PROPS.height}
      calculateMetadata={({ props }) => {
        const p = props as ShortVideoProps;
        return {
          durationInFrames: Math.max(1, Math.round((p.durationMs / 1000) * p.fps)),
          fps: p.fps,
          width: p.width,
          height: p.height,
        };
      }}
    />
  );
};
