"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { COVER_POSITIONS, COVER_POSITION_LABELS, COVER_TITLE_MAX, GRID_VISIBLE, type CoverPosition, type CoverTitle } from "@/lib/video-cover";

export interface CoverImageChoice {
  src: string;
  label: string;
}

/**
 * Export tab: the video's cover — one of its images, a short title over it —
 * downloaded as a 1080×1920 picture to set as the post's cover. Nothing is
 * generated: the image is already the project's and the titles come with the
 * script, so it costs nothing.
 */
export function CoverPanel({ projectId, images, titles }: { projectId: string; images: CoverImageChoice[]; titles: CoverTitle[] }) {
  const [img, setImg] = useState(images[0]?.src ?? "");
  const [title, setTitle] = useState(titles[0]?.title ?? "");
  const [emphasis, setEmphasis] = useState(titles[0]?.emphasis ?? "");
  const [position, setPosition] = useState<CoverPosition>("bottom");

  // A scene redrawn or removed takes its image off the list: fall back to the first one left.
  useEffect(() => {
    if (!images.some((i) => i.src === img)) setImg(images[0]?.src ?? "");
  }, [images, img]);

  // Typing redraws the preview after a pause, not on every key.
  const [settled, setSettled] = useState({ title, emphasis });
  useEffect(() => {
    const t = setTimeout(() => setSettled({ title, emphasis }), 500);
    return () => clearTimeout(t);
  }, [title, emphasis]);

  const url = useMemo(() => {
    const q = new URLSearchParams({ img, title: settled.title, em: settled.emphasis, pos: position });
    return `/api/projects/${projectId}/cover?${q.toString()}`;
  }, [projectId, img, settled, position]);

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
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="relative mx-auto w-[180px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]" style={{ aspectRatio: "9 / 16" }}>
          <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />
          <img key={url} src={url} alt="Aperçu de la couverture" className="absolute inset-0 h-full w-full" />
          {/* What a profile grid keeps of the cover: the title has to sit between these lines. */}
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/50" style={{ top: `${GRID_VISIBLE.top * 100}%` }} />
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/50" style={{ top: `${GRID_VISIBLE.bottom * 100}%` }} />
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Image</Label>
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
              {images.map((i) => (
                <button
                  key={i.src}
                  type="button"
                  onClick={() => setImg(i.src)}
                  className={cn("relative h-20 w-[45px] shrink-0 overflow-hidden rounded-md border-2", i.src === img ? "border-primary" : "border-transparent opacity-70")}
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
                    onClick={() => { setTitle(t.title); setEmphasis(t.emphasis); }}
                    className={cn("rounded-full border px-2.5 py-1 text-left text-xs", t.title === title ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")}
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
              <Input id="cover-title" value={title} maxLength={COVER_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="6 mots maximum" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cover-emphasis" className="text-xs">Mot en couleur</Label>
              <Input id="cover-emphasis" value={emphasis} maxLength={40} onChange={(e) => setEmphasis(e.target.value)} placeholder="facultatif" className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Position du titre</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {COVER_POSITIONS.map((p) => (
                <button key={p} type="button" onClick={() => setPosition(p)} className={cn("rounded-lg border px-2 py-1.5 text-xs", p === position ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03]")}>
                  {COVER_POSITION_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <a href={`${url}&download=1`} download className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/15">
            <Download className="h-4 w-4" /> Télécharger la couverture
          </a>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Instagram : au moment de publier, « Modifier la couverture » → « Ajouter depuis la pellicule ». Les pointillés montrent ce que ta grille de profil garde : le titre doit rester entre les deux.
          </p>
        </div>
      </div>
    </Section>
  );
}
