"use client";

import { Type, Palette, Ruler, SlidersHorizontal } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/ui/section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAPTION_PRESETS, CAPTION_FONTS } from "@/lib/captions/presets";
import type { CaptionStyle } from "@/lib/validations";
import { cn } from "@/lib/utils";

const POSITION_LABELS: Record<CaptionStyle["position"], string> = { top: "Haut", center: "Centre", bottom: "Bas" };

export function CaptionsPanel({ style, onChange }: { style: CaptionStyle; onChange: (s: CaptionStyle) => void }) {
  const set = <K extends keyof CaptionStyle>(k: K, v: CaptionStyle[K]) => onChange({ ...style, [k]: v });

  // Closed sections still have to say what they hold, so each header carries the
  // one or two values you'd otherwise open it just to check.
  const activeOptions = [
    style.uppercase && "Majuscules",
    style.shadow && "Ombre",
    style.backgroundColor && "Fond",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Style</Label>
        <div className="grid grid-cols-3 gap-2">
          {CAPTION_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => onChange({ ...p.style })} className={cn("rounded-lg border p-2 text-left transition", style.preset === p.id ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
              <div className="flex h-10 items-center justify-center rounded bg-[linear-gradient(160deg,#2a1657,#0B0714)] text-xs" style={{ fontFamily: p.style.fontFamily, fontWeight: p.style.fontWeight, color: p.style.textColor, textTransform: p.style.uppercase ? "uppercase" : "none", textShadow: p.id === "neon" ? `0 0 8px ${p.style.highlightColor}` : "0 1px 4px rgba(0,0,0,.6)" }}>
                Deviens <span style={{ color: p.style.highlightMode === "box" ? "#fff" : p.style.highlightColor, background: p.style.highlightMode === "box" ? p.style.highlightColor : "transparent", padding: "0 3px", borderRadius: 3 }}>viral</span>
              </div>
              <p className="mt-1 text-[11px] font-medium">{p.name}</p>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Un style suffit pour publier. Les réglages ci-dessous ne servent qu&apos;à l&apos;affiner.</p>
      </div>

      <Section title="Police et animation" icon={Type} summary={`${style.fontFamily} · ${POSITION_LABELS[style.position]}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Police</Label>
            <Select value={style.fontFamily} onValueChange={(v) => set("fontFamily", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CAPTION_FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Surbrillance</Label>
            <Select value={style.highlightMode} onValueChange={(v) => set("highlightMode", v as CaptionStyle["highlightMode"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="color">Couleur</SelectItem><SelectItem value="box">Cadre</SelectItem><SelectItem value="underline">Soulignement</SelectItem><SelectItem value="scale">Zoom</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Position</Label>
            <Select value={style.position} onValueChange={(v) => set("position", v as CaptionStyle["position"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="top">Haut</SelectItem><SelectItem value="center">Centre</SelectItem><SelectItem value="bottom">Bas</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Animation</Label>
            <Select value={style.animation} onValueChange={(v) => set("animation", v as CaptionStyle["animation"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="pop">Pop</SelectItem><SelectItem value="slide">Glissement</SelectItem><SelectItem value="fade">Fondu</SelectItem><SelectItem value="none">Aucune</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        {style.position !== "center" && (
          <p className="mt-3 text-[11px] text-amber-300">TikTok et Reels recouvrent le haut et le bas de l&apos;écran avec leur propre interface. Le centre reste la zone la plus sûre.</p>
        )}
      </Section>

      <Section
        title="Couleurs"
        icon={Palette}
        summary={
          <span className="flex items-center justify-end gap-1">
            {[style.textColor, style.highlightColor, style.strokeColor].map((c, i) => (
              <span key={i} className="h-3 w-3 shrink-0 rounded-full border border-white/20" style={{ background: c }} />
            ))}
          </span>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <ColorField label="Texte" value={style.textColor} onChange={(v) => set("textColor", v)} />
          <ColorField label="Surbrillance" value={style.highlightColor} onChange={(v) => set("highlightColor", v)} />
          <ColorField label="Contour" value={style.strokeColor} onChange={(v) => set("strokeColor", v)} />
        </div>
      </Section>

      <Section title="Taille et disposition" icon={Ruler} summary={`${style.fontSize}px · ${style.wordsPerLine} mot${style.wordsPerLine > 1 ? "s" : ""}/ligne`}>
        <div className="space-y-4">
          <Range label="Taille de police" value={style.fontSize} min={32} max={140} step={2} onChange={(v) => set("fontSize", v)} suffix="px" />
          <Range label="Graisse" value={style.fontWeight} min={400} max={900} step={100} onChange={(v) => set("fontWeight", v)} />
          <Range label="Épaisseur du contour" value={style.strokeWidth} min={0} max={16} step={1} onChange={(v) => set("strokeWidth", v)} suffix="px" />
          <Range label="Mots par ligne" value={style.wordsPerLine} min={1} max={7} step={1} onChange={(v) => set("wordsPerLine", v)} />
          <Range label="Lignes maximum" value={style.maxLines} min={1} max={3} step={1} onChange={(v) => set("maxLines", v)} />
          <Range label="Décalage vertical" value={style.verticalOffset} min={-30} max={30} step={1} onChange={(v) => set("verticalOffset", v)} suffix="%" />
        </div>
      </Section>

      <Section title="Options" icon={SlidersHorizontal} summary={activeOptions.length ? activeOptions.join(" · ") : "Aucune"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Majuscules" checked={style.uppercase} onChange={(v) => set("uppercase", v)} />
            <Toggle label="Ombre portée" checked={style.shadow} onChange={(v) => set("shadow", v)} />
            <Toggle label="Fond encadré" checked={Boolean(style.backgroundColor)} onChange={(v) => set("backgroundColor", v ? "#000000" : null)} />
          </div>
          {style.backgroundColor && <Range label="Opacité du fond" value={Math.round(style.backgroundOpacity * 100)} min={10} max={100} step={5} onChange={(v) => set("backgroundOpacity", v / 100)} suffix="%" />}
        </div>
      </Section>
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
    <label className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
      <span className="min-w-0 truncate">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
