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
  /** Frame shown before playback starts (defaults to the first). */
  initialFrame?: number;
}

export const PreviewPlayer = forwardRef<PlayerRef, Props>(function PreviewPlayer({ inputProps, className, autoPlay = false, initialFrame }, ref) {
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
        initialFrame={initialFrame === undefined ? undefined : Math.min(Math.max(0, Math.round(initialFrame)), durationInFrames - 1)}
        loop
        clickToPlay
        spaceKeyToPlayOrPause
        showVolumeControls
        // A phone has no pointer to move, so the control bar's idle-hide timer
        // fires and never resets: playback starts and there is then no visible
        // way to stop it. Pin the bar open instead.
        alwaysShowControls
        hideControlsWhenPointerDoesntMove={false}
        // Remotion's default deliberately registers a pause button with the
        // OS/lock-screen media widget that does nothing when pressed — its own
        // "prevent" mode. On Android that widget appears the moment preview
        // audio plays, so its pause button looking real but doing nothing is
        // exactly the dead-end this was. Wire it to the player's own pause.
        browserMediaControlsBehavior={{ mode: "register-media-session" }}
        acknowledgeRemotionLicense
      />
    </div>
  );
});
