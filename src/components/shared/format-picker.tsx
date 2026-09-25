"use client";

import { Film, GalleryHorizontalEnd, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentFormat } from "@/lib/format";

const OPTIONS: { id: ContentFormat; label: string; icon: typeof Film }[] = [
  { id: "video", label: "Vidéo", icon: Film },
  { id: "carousel", label: "Carrousel", icon: GalleryHorizontalEnd },
  { id: "both", label: "Les deux", icon: Layers },
];

/**
 * What to build from the script about to be written — a first-class choice,
 * not a link discovered after the fact inside a video-shaped editor.
 */
export function FormatPicker({ value, onChange, className }: { value: ContentFormat; onChange: (format: ContentFormat) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Format" className={cn("inline-flex h-9 items-center rounded-full border border-white/10 bg-black/20 p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "inline-flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-medium transition",
            value === o.id ? "bg-white/10 text-foreground shadow-glow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="h-3.5 w-3.5" /> {o.label}
        </button>
      ))}
    </div>
  );
}
