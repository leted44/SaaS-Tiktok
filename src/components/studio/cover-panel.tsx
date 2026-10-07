"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { VideoCoverView } from "@/components/studio/video-cover";
import { COVER_FAMILIES } from "@/components/studio/cover-fonts";
import { luminance } from "@/lib/carousel/templates";
import { cn } from "@/lib/utils";
import type { CoverLook } from "@/lib/space-kit";
import { COVER_COLORS, COVER_FONTS, COVER_FONT_IDS, COVER_POSITIONS, COVER_POSITION_LABELS, COVER_SIZE, COVER_STYLES, COVER_TITLE_MAX, GRID_VISIBLE, type CoverEffect, type CoverFont, type CoverPosition, type CoverTitle } from "@/lib/video-cover";

const EFFECT_LABELS: Record<CoverEffect, string> = { shadow: "Ombre", outline: "Contour", glow: "Lumineux", box: "Encadré" };

/** The word colour when the account's own accent is too dark to read on a picture — the same rule as the server's. */
const FALLBACK_ACCENT = "#FFD23F";

export interface CoverImageChoice {
  src: string;
  label: string;
}

/**
 * The cover's settings, kept by the studio so they survive the Couverture
 * block being folded or another tab opened, so the ready card can offer the
 * download too, and so the space's look can be saved from them.
 */
export function useCoverSettings({ projectId, images, titles, accountAccent, initial }: { projectId: string; images: CoverImageChoice[]; titles: CoverTitle[]; accountAccent: string; /** The space's saved cover look (lib/space-kit), to start from. */ initial?: CoverLook | null }) {
  const [img, setImg] = useState(images[0]?.src ?? "");
  const [title, setTitle] = useState(titles[0]?.title ?? "");
  const [emphasis, setEmphasis] = useState(titles[0]?.emphasis ?? "");
  const [position, setPosition] = useState<CoverPosition>(initial?.position ?? "bottom");
  const [font, setFont] = useState<CoverFont>(initial?.font ?? "anton");
  const [effect, setEffect] = useState<CoverEffect>(initial?.effect ?? "shadow");
  const [styleId, setStyleId] = useState<string | null>(initial?.styleId ?? null);
  const [color, setColor] = useState<string>(initial?.color ?? COVER_COLORS[0]);
  /** Empty: the account's accent colour. */
  const [wordColor, setWordColor] = useState(initial?.wordColor ?? "");

  /** The look alone — what the space keeps (lib/space-kit), without this video's picture and words. */
  const look: CoverLook = { styleId, font, color, wordColor, effect, position };
  function applyLook(l: CoverLook) {
    setStyleId(l.styleId);
    setFont(l.font);
    setColor(l.color);
    setWordColor(l.wordColor);
    setEffect(l.effect);
    setPosition(l.position);
  }

  // Kept by the studio across tabs: a script written meanwhile brings the first titles.
  const firstTitle = titles[0]?.title ?? "";
  useEffect(() => {
    if (!firstTitle) return;
    setTitle((t) => t || firstTitle);
    setEmphasis((e) => e || (titles[0]?.emphasis ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstTitle]);

  // A scene redrawn or removed takes its image off the list: fall back to the first one left.
  useEffect(() => {
    if (!images.some((i) => i.src === img)) setImg(images[0]?.src ?? "");
  }, [images, img]);

  /** The picture to download, drawn by the server from exactly these settings. */
  const downloadUrl = useMemo(() => {
    const q = new URLSearchParams({ img, title, em: emphasis, pos: position, font, fg: color, fx: effect, ...(wordColor ? { hl: wordColor } : {}) });
    return `/api/projects/${projectId}/cover?${q.toString()}&download=1`;
  }, [projectId, img, title, emphasis, position, font, color, wordColor, effect]);

  /** A ready-made look: face, both colours and effect at once — each stays adjustable. */
  function applyStyle(id: string) {
    const st = COVER_STYLES.find((x) => x.id === id);
    if (!st) return;
    setStyleId(id);
    setFont(st.font);
    setColor(st.color);
    setWordColor(st.word);
    setEffect(st.effect);
  }

  const accent = wordColor || (luminance(accountAccent) > 0.25 ? accountAccent : FALLBACK_ACCENT);
  return {
    available: images.length > 0,
    img, setImg, title, setTitle, emphasis, setEmphasis, position, setPosition, font, setFont, effect, setEffect,
    styleId, applyStyle, color, setColor, wordColor, setWordColor, accent, downloadUrl, look, applyLook,
  };
}

export type CoverSettings = ReturnType<typeof useCoverSettings>;

/**
 * The cover drawn in the page itself, from the same component the server
 * draws the download with — every change shows at once, with no round trip.
 * Drawn at full size (1080×1920) and scaled down to the frame.
 */
function CoverPreview({ cover }: { cover: CoverSettings }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(el.clientWidth / COVER_SIZE.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} className="relative w-[min(56vw,220px)] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] sm:w-[200px]" style={{ aspectRatio: "9 / 16" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: COVER_SIZE.width, height: COVER_SIZE.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <VideoCoverView imageSrc={cover.img || null} title={cover.title} emphasis={cover.emphasis} position={cover.position} accent={cover.accent} color={cover.color} font={cover.font} effect={cover.effect} family={COVER_FAMILIES[cover.font]} />
      </div>
      {/* What a profile grid keeps of the cover: the title has to sit between these lines. */}
      <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/50" style={{ top: `${GRID_VISIBLE.top * 100}%` }} />
      <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/50" style={{ top: `${GRID_VISIBLE.bottom * 100}%` }} />
    </div>
  );
}

/** The download, as visible as the video's own. */
export function CoverDownloadButton({ cover, className }: { cover: CoverSettings; className?: string }) {
  return (
    <Button asChild size="lg" variant="gradient" className={cn("w-full", className)}>
      <a href={cover.downloadUrl} download>
        <Download /> Télécharger la couverture
      </a>
    </Button>
  );
}

/**
 * Export tab: the video's cover — one of its images, a short title over it —
 * downloaded as a 1080×1920 picture to set as the post's cover. Nothing is
 * generated: the image is already the project's and the titles come with the
 * script, so it costs nothing.
 */
export function CoverPanel({ cover, images, titles }: { cover: CoverSettings; images: CoverImageChoice[]; titles: CoverTitle[] }) {
  if (!images.length) {
    return (
      <Section title="Couverture" icon={ImageIcon} summary="Image + titre">
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 p-3 text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4 shrink-0" /> Ajoute d&apos;abord des images dans l&apos;onglet Visuels : la couverture reprend l&apos;une d&apos;elles.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Couverture" icon={ImageIcon} summary="Image + titre">
      <p className="mb-3 text-xs text-muted-foreground">Une image de la vidéo avec un titre accrocheur, à importer comme couverture : c&apos;est elle qui s&apos;affiche sur ta grille de profil. Gratuit.</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-3 sm:items-stretch">
          <CoverPreview cover={cover} />
          <CoverDownloadButton cover={cover} className="sm:w-[200px]" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <Label className="text-xs">Image</Label>
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
              {images.map((i) => (
                <button
                  key={i.src}
                  type="button"
                  onClick={() => cover.setImg(i.src)}
                  className={cn("relative h-20 w-[45px] shrink-0 overflow-hidden rounded-md border-2", i.src === cover.img ? "border-primary" : "border-transparent opacity-70")}
                  title={i.label}
                >
                  <img src={i.src} alt={i.label} className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-0.5 text-center text-[9px] text-white">{i.label}</span>
                </button>
              ))}
            </div>
          </div>

          {titles.length > 0 && (
            <div>
              <Label className="text-xs">Titres proposés</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {titles.map((t) => (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => { cover.setTitle(t.title); cover.setEmphasis(t.emphasis); }}
                    className={cn("rounded-full border px-2.5 py-1 text-left text-xs", t.title === cover.title ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
            <div>
              <Label htmlFor="cover-title" className="text-xs">Titre</Label>
              <Input id="cover-title" value={cover.title} maxLength={COVER_TITLE_MAX} onChange={(e) => cover.setTitle(e.target.value)} placeholder="6 mots maximum" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cover-emphasis" className="text-xs">Mot en couleur</Label>
              <Input id="cover-emphasis" value={cover.emphasis} maxLength={40} onChange={(e) => cover.setEmphasis(e.target.value)} placeholder="facultatif" className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Position du titre</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {COVER_POSITIONS.map((p) => (
                <button key={p} type="button" onClick={() => cover.setPosition(p)} className={cn("rounded-lg border px-2 py-1.5 text-xs", p === cover.position ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03]")}>
                  {COVER_POSITION_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Style d&apos;écriture</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {COVER_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => cover.applyStyle(st.id)}
                  className={cn("truncate rounded-lg border bg-[#1a1220] px-2 py-2 text-sm", st.id === cover.styleId ? "border-primary ring-1 ring-primary/40" : "border-white/10")}
                  style={{ fontFamily: COVER_FAMILIES[st.font], fontWeight: COVER_FONTS[st.font].weight, textTransform: COVER_FONTS[st.font].upper ? "uppercase" : "none", color: st.color, textShadow: st.effect === "glow" ? `0 0 8px ${st.word}` : undefined }}
                >
                  {st.effect === "box" ? <span className="rounded px-1" style={{ background: st.word }}>{st.label}</span> : <span style={{ color: st.word === st.color ? st.color : st.word }}>{st.label}</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Police</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {COVER_FONT_IDS.map((f) => (
                <button key={f} type="button" onClick={() => cover.setFont(f)} className={cn("truncate rounded-lg border px-2 py-1.5 text-sm", f === cover.font ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03]")} style={{ fontFamily: COVER_FAMILIES[f], fontWeight: COVER_FONTS[f].weight }}>
                  {COVER_FONTS[f].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Effet</Label>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {(Object.keys(EFFECT_LABELS) as CoverEffect[]).map((fx) => (
                <button key={fx} type="button" onClick={() => cover.setEffect(fx)} className={cn("truncate rounded-lg border px-1 py-1.5 text-xs", fx === cover.effect ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03]")}>
                  {EFFECT_LABELS[fx]}
                </button>
              ))}
            </div>
          </div>

          <Swatches label="Couleur du titre" value={cover.color} onChange={cover.setColor} />
          <Swatches label="Couleur du mot" value={cover.wordColor} onChange={cover.setWordColor} auto />

          <p className="text-[11px] leading-snug text-muted-foreground">
            Instagram : au moment de publier, « Modifier la couverture » → « Ajouter depuis la pellicule ». Les pointillés montrent ce que ta grille de profil garde : le titre doit rester entre les deux.
          </p>
        </div>
      </div>
    </Section>
  );
}

/** A row of colour dots; `auto` adds a first dot standing for the account's accent colour (value ""). */
function Swatches({ label, value, onChange, auto }: { label: string; value: string; onChange: (v: string) => void; auto?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {auto && (
          <button type="button" onClick={() => onChange("")} className={cn("h-7 rounded-full border px-2 text-[11px]", value === "" ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03]")}>
            Auto
          </button>
        )}
        {COVER_COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} className={cn("h-7 w-7 rounded-full border-2", c === value ? "border-primary ring-2 ring-primary/40" : "border-white/15")} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
