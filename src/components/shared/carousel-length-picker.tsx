"use client";

import type { CarouselLength } from "@/lib/carousel/schema";
import { cn } from "@/lib/utils";

const OPTIONS: { id: CarouselLength; label: string }[] = [
  { id: "single", label: "1 image" },
  { id: "short", label: "4 slides" },
  { id: "full", label: "6 slides" },
];

/**
 * How many slides the carousel will have — asked before the script is
 * written, so the script carries exactly that many ideas instead of a video's
 * worth squeezed or padded into slides afterwards.
 */
export function CarouselLengthPicker({ value, onChange, className }: { value: CarouselLength; onChange: (length: CarouselLength) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Nombre de slides" className={cn("inline-flex h-8 items-center rounded-full border border-white/10 p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("h-full flex-1 whitespace-nowrap rounded-full px-2.5 text-xs transition", value === o.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
