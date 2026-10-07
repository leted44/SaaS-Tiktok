"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAROUSEL_FORMATS, CAROUSEL_TEMPLATES, FORMAT_SIZE, type CarouselFormat, type CarouselTemplate } from "@/lib/carousel/schema";
import { resolveTemplate } from "@/lib/carousel/templates";
import { cn } from "@/lib/utils";

/** Accent colours offered per carousel — bright enough to pop on a photo. */
export const ACCENTS = [
  { hex: "#FFC21A", label: "Jaune" },
  { hex: "#2EA8FF", label: "Bleu" },
  { hex: "#FF3B3B", label: "Rouge" },
  { hex: "#22D46B", label: "Vert" },
  { hex: "#FF4FA3", label: "Rose" },
  { hex: "#FFFFFF", label: "Blanc" },
];

export interface CarouselDesign {
  template: CarouselTemplate;
  format: CarouselFormat;
  accent: string | null;
  handle: string | null;
}

/**
 * A carousel's design — template, accent colour, format, signature: in the
 * carousel editor, and in a space's look (lib/space-kit) for its next ones.
 */
export function CarouselDesignControls({ value, onChange, brand }: { value: CarouselDesign; onChange: (patch: Partial<CarouselDesign>) => void; brand: { primary: string; accent: string } }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Modèle</Label>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {CAROUSEL_TEMPLATES.map((id) => {
            const t = resolveTemplate(id, brand, value.accent);
            const selected = value.template === id;
            const poster = t.headlineFont === "Anton" || t.headlineFont === "Barlow Condensed";
            const photo = `linear-gradient(180deg, #6b4a2b 0%, #2a1c12 45%, ${t.background} 75%)`;
            return (
              <button key={id} type="button" onClick={() => onChange({ template: id })} className={cn("rounded-lg border p-1 text-left transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                {id === "boxed" ? (
                  // A photo with the caption box at its foot, the way the slides are laid out.
                  <div className="flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-md p-1" style={{ background: "linear-gradient(160deg, #d9432f 0%, #8c2b1f 55%, #3a1510 100%)" }}>
                    <div className="flex flex-col gap-1 rounded bg-black/85 px-1.5 py-1.5">
                      <div className="h-0.5 w-3 rounded-full" style={{ background: t.accent }} />
                      <span className="text-sm font-black uppercase leading-none" style={{ color: t.text, fontFamily: "Impact, 'Arial Narrow Bold', 'Arial Narrow', sans-serif" }}>Aa <span style={{ color: t.accent }}>Aa</span></span>
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-[4/5] flex-col justify-center gap-1.5 overflow-hidden rounded-md px-1.5" style={{ background: poster ? photo : t.background }}>
                    <div className="h-1 w-5 rounded-full" style={{ background: t.accent }} />
                    <span
                      className={cn("leading-none", poster ? "text-base uppercase" : "text-lg font-extrabold")}
                      style={{ color: t.text, fontFamily: poster ? "Impact, 'Arial Narrow Bold', 'Arial Narrow', sans-serif" : t.headlineFont === "Playfair Display" ? "Georgia, 'Times New Roman', serif" : "inherit" }}
                    >
                      Aa
                    </span>
                    <div className="h-1 w-4/5 rounded-full" style={{ background: t.muted }} />
                  </div>
                )}
                <p className="mt-1 truncate text-[11px] font-medium">{t.name}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Couleur d'accent</Label>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Couleur d'accent">
          <button
            type="button"
            role="radio"
            aria-checked={value.accent === null}
            onClick={() => onChange({ accent: null })}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition", value.accent === null ? "border-primary/60 bg-primary/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20")}
          >
            <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: brand.accent }} /> Marque
          </button>
          {ACCENTS.map((a) => (
            <button
              key={a.hex}
              type="button"
              role="radio"
              aria-checked={value.accent === a.hex}
              aria-label={a.label}
              title={a.label}
              onClick={() => onChange({ accent: a.hex })}
              className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 transition", value.accent === a.hex ? "border-white" : "border-transparent hover:border-white/30")}
            >
              <span className="h-6 w-6 rounded-full" style={{ background: a.hex }} />
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Les mots clés, les numéros et les boutons. « Marque » reprend la couleur de ta page Marque.</p>
      </div>

      <div className="space-y-2">
        <Label>Format</Label>
        <div className="grid grid-cols-3 gap-2">
          {CAROUSEL_FORMATS.map((f) => (
            <button key={f} type="button" onClick={() => onChange({ format: f })} className={cn("rounded-lg border p-2.5 text-center transition", value.format === f ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
              <p className="text-sm font-semibold">{FORMAT_SIZE[f].label}</p>
              <p className="text-[11px] text-muted-foreground">{FORMAT_SIZE[f].hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Signature</Label>
        <Input value={value.handle ?? ""} maxLength={40} placeholder="@toncompte" onChange={(e) => onChange({ handle: e.target.value || null })} />
        <p className="text-[11px] text-muted-foreground">Affichée en haut de chaque slide et sur la dernière.</p>
      </div>
    </>
  );
}
