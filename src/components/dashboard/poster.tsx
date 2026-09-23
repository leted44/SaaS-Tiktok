import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

const PALETTES = [
  "from-violet-600/90 via-fuchsia-600/70 to-orange-500/70",
  "from-fuchsia-600/90 via-pink-600/70 to-amber-500/60",
  "from-indigo-600/90 via-violet-600/70 to-pink-500/60",
  "from-rose-600/80 via-fuchsia-700/70 to-violet-700/80",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A project's cover: its real thumbnail once rendered, otherwise a brand
 * gradient (optionally with the title) — never a stand-in picture that
 * could pass for the video.
 */
export function Poster({ id, title, thumbnailUrl, showTitle = false, className, children }: { id: string; title: string; thumbnailUrl: string | null; showTitle?: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden bg-[#120d1f]", className)}>
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.05]" />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-br transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.05]", PALETTES[hash(id) % PALETTES.length])}>
          <div className="dot-grid absolute inset-0 opacity-50" />
          <div className="absolute -left-1/4 top-1/4 h-1/2 w-[150%] rotate-12 bg-white/10 blur-2xl" />
          {showTitle ? (
            <p className="absolute inset-x-3 top-1/2 line-clamp-4 -translate-y-1/2 text-center font-display text-[13px] font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.45)]">{title}</p>
          ) : (
            <Clapperboard aria-hidden className="absolute left-1/2 top-[38%] h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-white/35" />
          )}
        </div>
      )}
      {children}
    </div>
  );
}
