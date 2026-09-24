import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

const PALETTES = [
  "from-violet-500/25 via-[#15111f] to-[#0d0b14]",
  "from-fuchsia-500/20 via-[#15111f] to-[#0d0b14]",
  "from-indigo-500/25 via-[#14121f] to-[#0d0b14]",
  "from-rose-500/20 via-[#15111f] to-[#0d0b14]",
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
          {showTitle ? (
            <p className="absolute inset-x-3 top-1/2 line-clamp-4 -translate-y-1/2 text-center font-display text-[13px] font-extrabold uppercase leading-tight text-white/85">{title}</p>
          ) : (
            <Clapperboard aria-hidden className="absolute left-1/2 top-[38%] h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-white/20" />
          )}
        </div>
      )}
      {children}
    </div>
  );
}
