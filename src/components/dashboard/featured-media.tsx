"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";

/**
 * The finished video in place of the cover: it plays silently on hover
 * (unless reduced motion is asked for), and with sound and controls on tap.
 */
export function FeaturedMedia({ videoUrl, poster }: { videoUrl: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [engaged, setEngaged] = useState(false);

  const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hoverCapable = () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => {
        if (engaged || calm() || !hoverCapable()) return;
        void ref.current?.play().catch(() => {});
      }}
      onMouseLeave={() => {
        if (engaged || !ref.current) return;
        ref.current.pause();
        ref.current.currentTime = 0;
      }}
    >
      <video ref={ref} src={videoUrl} poster={poster ?? undefined} muted={!engaged} loop={!engaged} playsInline preload="none" controls={engaged} className="absolute inset-0 h-full w-full object-cover" />
      {!engaged && (
        <button
          type="button"
          aria-label="Lire la vidéo"
          onClick={() => {
            setEngaged(true);
            const v = ref.current;
            if (!v) return;
            v.currentTime = 0;
            v.muted = false;
            void v.play().catch(() => {});
          }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-md transition duration-300 motion-safe:group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}
