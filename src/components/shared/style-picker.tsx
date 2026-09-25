import { Check } from "lucide-react";
import { ART_DIRECTIONS, VISUAL_STYLES, type VisualStyle } from "@/lib/carousel/art-direction";
import { cn } from "@/lib/utils";

/** The five art directions, each previewed by its palette — shared between the carousel and video visuals. */
export function StylePicker({ value, onChange }: { value: VisualStyle; onChange: (style: VisualStyle) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {VISUAL_STYLES.map((id) => {
        const art = ART_DIRECTIONS[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(id)}
            className={cn("relative rounded-lg border p-2 text-left transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}
          >
            <div className="flex h-7 overflow-hidden rounded-md">
              {art.swatch.map((c) => <div key={c} className="flex-1" style={{ background: c }} />)}
            </div>
            <p className="mt-1.5 text-xs font-semibold">{art.label}</p>
            <p className="text-[10px] leading-snug text-muted-foreground">{art.hint}</p>
            {selected && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 rounded-full bg-primary p-0.5 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
