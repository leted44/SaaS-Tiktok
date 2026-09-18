"use client";

import { useEffect, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import type { ShortVideoProps } from "@/lib/render/props";
import { formatDuration, cn } from "@/lib/utils";

export function Timeline({ props, playerRef, selectedScene, onSelectScene }: { props: ShortVideoProps; playerRef: React.RefObject<PlayerRef | null>; selectedScene: number | null; onSelectScene: (i: number) => void }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    player.addEventListener("frameupdate", onFrame);
    return () => player.removeEventListener("frameupdate", onFrame);
  }, [playerRef, props.durationMs]);

  const total = props.durationMs;
  const nowMs = (frame / props.fps) * 1000;
  const seek = (ms: number) => playerRef.current?.seekTo(Math.round((ms / 1000) * props.fps));
  const labels = ["Hook", ...props.scenes.slice(1, -1).map((_, i) => `Scene ${i + 1}`), "CTA"];

  return (
    <div className="surface p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Timeline</span>
        <span className="font-mono tabular-nums">{formatDuration(nowMs)} / {formatDuration(total)}</span>
      </div>
      <div className="relative">
        <div className="flex h-12 w-full gap-0.5 overflow-hidden rounded-lg">
          {props.scenes.map((s, i) => {
            const w = Math.max(2, ((s.endMs - s.startMs) / total) * 100);
            const active = nowMs >= s.startMs && nowMs < s.endMs;
            return (
              <button
                key={s.index}
                onClick={() => { seek(s.startMs); onSelectScene(i); }}
                style={{ width: `${w}%` }}
                title={s.text}
                className={cn("group relative flex flex-col justify-end overflow-hidden px-1.5 py-1 text-left transition-colors", i === 0 ? "bg-brand-600/40" : i === props.scenes.length - 1 ? "bg-pink-600/30" : "bg-white/[0.06]", active && "ring-1 ring-inset ring-primary", selectedScene === i && "bg-white/[0.12]", "hover:bg-white/[0.14]")}
              >
                <span className="truncate text-[10px] font-semibold text-white/90">{labels[i]}</span>
                <span className="truncate text-[9px] text-white/50">{((s.endMs - s.startMs) / 1000).toFixed(1)}s</span>
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-400 shadow-[0_0_8px_#FBBF24]" style={{ left: `${Math.min(100, (nowMs / total) * 100)}%` }} />
        {props.visualLayers.length > 0 && (
          <div className="relative mt-1 h-3 w-full overflow-hidden rounded bg-white/[0.03]">
            {props.visualLayers.map((l) => (
              <div key={l.id} className="absolute top-0 h-full rounded bg-cyan-400/50" style={{ left: `${(l.startMs / total) * 100}%`, width: `${Math.max(1, ((l.endMs - l.startMs) / total) * 100)}%` }} title={l.type} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
