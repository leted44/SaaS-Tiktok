"use client";

import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { BackgroundStyle } from "@/lib/validations";
import { cn } from "@/lib/utils";

export function backgroundLabel(b: BackgroundStyle): string {
  return b.type === "gradient" ? "Dégradé" : b.type === "solid" ? "Uni" : "Grain";
}

/** The animated background behind every scene. Shared by the studio and the autopilot template editor. */
export function BackgroundControls({ value: background, onChange }: { value: BackgroundStyle; onChange: (b: BackgroundStyle) => void }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {([["gradient", "Dégradé"], ["solid", "Uni"], ["grain", "Grain"]] as const).map(([t, label]) => (
          <button key={t} type="button" onClick={() => onChange({ ...background, type: t })} className={cn("rounded-lg border px-2 py-1.5 text-xs transition", background.type === t ? "border-primary/60 bg-primary/10" : "border-white/10")}>{label}</button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {background.colors.map((c, i) => (
          <input key={i} type="color" value={c} onChange={(e) => onChange({ ...background, colors: background.colors.map((x, k) => (k === i ? e.target.value : x)) })} className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5" />
        ))}
        {background.colors.length < 3 && <Button size="sm" variant="ghost" onClick={() => onChange({ ...background, colors: [...background.colors, "#DB2777"] })}><Palette /> Ajouter</Button>}
        {background.colors.length > 1 && <Button size="sm" variant="ghost" onClick={() => onChange({ ...background, colors: background.colors.slice(0, -1) })}>Retirer</Button>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm"><span>Vignettage</span><Switch checked={background.vignette} onCheckedChange={(v) => onChange({ ...background, vignette: v })} /></label>
        <label className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm"><span>Grain de film</span><Switch checked={background.grain} onCheckedChange={(v) => onChange({ ...background, grain: v })} /></label>
      </div>
    </>
  );
}
