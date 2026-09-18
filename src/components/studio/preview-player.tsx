"use client";

import { forwardRef, useMemo } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { ShortVideo } from "@/remotion/compositions/ShortVideo";
import type { ShortVideoProps } from "@/lib/render/props";
import { cn } from "@/lib/utils";

interface Props {
  inputProps: ShortVideoProps;
  className?: string;
  autoPlay?: boolean;
}

export const PreviewPlayer = forwardRef<PlayerRef, Props>(function PreviewPlayer({ inputProps, className, autoPlay = false }, ref) {
  const durationInFrames = useMemo(() => Math.max(1, Math.round((inputProps.durationMs / 1000) * inputProps.fps)), [inputProps.durationMs, inputProps.fps]);
  const aspect = inputProps.width / inputProps.height;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl", className)} style={{ aspectRatio: `${inputProps.width} / ${inputProps.height}`, maxHeight: aspect < 1 ? "min(72vh, 760px)" : undefined }}>
      <Player
        ref={ref}
        component={ShortVideo}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={inputProps.width}
        compositionHeight={inputProps.height}
        fps={inputProps.fps}
        style={{ width: "100%", height: "100%" }}
        controls
        autoPlay={autoPlay}
        loop
        clickToPlay
        spaceKeyToPlayOrPause
        showVolumeControls
        acknowledgeRemotionLicense
      />
    </div>
  );
});
