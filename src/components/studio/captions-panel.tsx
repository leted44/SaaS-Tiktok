"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAPTION_PRESETS, CAPTION_FONTS } from "@/lib/captions/presets";
import type { CaptionStyle } from "@/lib/validations";
import { cn } from "@/lib/utils";

export function CaptionsPanel({ style, onChange }: { style: CaptionStyle; onChange: (s: CaptionStyle) => void }) {
  const set = <K extends keyof CaptionStyle>(k: K, v: CaptionStyle[K]) => onChange({ ...style, [k]: v });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Preset</Label>
        <div className="grid grid-cols-3 gap-2">
          {CAPTION_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => onChange({ ...p.style })} className={cn("rounded-lg border p-2 text-left transition", style.preset === p.id ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
              <div className="flex h-10 items-center justify-center rounded bg-[linear-gradient(160deg,#2a1657,#0B0714)] text-xs" style={{ fontFamily: p.style.fontFamily, fontWeight: p.style.fontWeight, color: p.style.textColor, textTransform: p.style.uppercase ? "uppercase" : "none", textShadow: p.id === "neon" ? `0 0 8px ${p.style.highlightColor}` : "0 1px 4px rgba(0,0,0,.6)" }}>
                Go <span style={{ color: p.style.highlightMode === "box" ? "#fff" : p.style.highlightColor, background: p.style.highlightMode === "box" ? p.style.highlightColor : "transparent", padding: "0 3px", borderRadius: 3 }}>viral</span>
              </div>
              <p className="mt-1 text-[11px] font-medium">{p.name}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Font</Label>
          <Select value={style.fontFamily} onValueChange={(v) => set("fontFamily", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CAPTION_FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Highlight</Label>
          <Select value={style.highlightMode} onValueChange={(v) => set("highlightMode", v as CaptionStyle["highlightMode"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="color">Color</SelectItem><SelectItem value="box">Box</SelectItem><SelectItem value="underline">Underline</SelectItem><SelectItem value="scale">Scale pop</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Position</Label>
          <Select value={style.position} onValueChange={(v) => set("position", v as CaptionStyle["position"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="top">Top</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="bottom">Bottom</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Animation</Label>
          <Select value={style.animation} onValueChange={(v) => set("animation", v as CaptionStyle["animation"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="pop">Pop</SelectItem><SelectItem value="slide">Slide</SelectItem><SelectItem value="fade">Fade</SelectItem><SelectItem value="none">None</SelectItem></SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ColorField label="Text" value={style.textColor} onChange={(v) => set("textColor", v)} />
        <ColorField label="Highlight" value={style.highlightColor} onChange={(v) => set("highlightColor", v)} />
        <ColorField label="Stroke" value={style.strokeColor} onChange={(v) => set("strokeColor", v)} />
      </div>

      <Range label="Font size" value={style.fontSize} min={32} max={140} step={2} onChange={(v) => set("fontSize", v)} suffix="px" />
      <Range label="Weight" value={style.fontWeight} min={400} max={900} step={100} onChange={(v) => set("fontWeight", v)} />
      <Range label="Stroke width" value={style.strokeWidth} min={0} max={16} step={1} onChange={(v) => set("strokeWidth", v)} suffix="px" />
      <Range label="Words per line" value={style.wordsPerLine} min={1} max={7} step={1} onChange={(v) => set("wordsPerLine", v)} />
      <Range label="Max lines" value={style.maxLines} min={1} max={3} step={1} onChange={(v) => set("maxLines", v)} />
      <Range label="Vertical offset" value={style.verticalOffset} min={-30} max={30} step={1} onChange={(v) => set("verticalOffset", v)} suffix="%" />

      <div className="grid grid-cols-2 gap-3">
        <Toggle label="Uppercase" checked={style.uppercase} onChange={(v) => set("uppercase", v)} />
        <Toggle label="Drop shadow" checked={style.shadow} onChange={(v) => set("shadow", v)} />
        <Toggle label="Background box" checked={Boolean(style.backgroundColor)} onChange={(v) => set("backgroundColor", v ? "#000000" : null)} />
        {style.backgroundColor && <Range label="Box opacity" value={Math.round(style.backgroundOpacity * 100)} min={10} max={100} step={5} onChange={(v) => set("backgroundOpacity", v / 100)} suffix="%" />}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-[11px] uppercase text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}

function Range({ label, value, min, max, step, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between"><Label>{label}</Label><span className="text-xs tabular-nums">{value}{suffix}</span></div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
