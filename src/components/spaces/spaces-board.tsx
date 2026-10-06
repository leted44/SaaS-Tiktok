"use client";

import { useState } from "react";
import Link from "next/link";
import { Clapperboard, GalleryHorizontalEnd, ImagePlus, Lightbulb, Mic2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpaceManagerDialog } from "@/components/projects/space-manager-dialog";
import { TONE_LABELS, type Tone } from "@/lib/autopilot/template-shared";
import { LANGUAGE_LABELS } from "@/lib/tts/voices";
import type { SpaceOption } from "@/lib/spaces";

type SpaceCard = SpaceOption & { publishedCount: number; lessonCount: number };

/**
 * The spaces as cards: what each one makes its posts with (subject,
 * characters, voice) at a glance, and the two ways to start a post in it.
 * Editing opens the same form the Projets page used to hide behind "Gérer".
 */
export function SpacesBoard({ spaces, voices, sheetGeneration, initialEdit }: { spaces: SpaceCard[]; voices: { id: string; name: string }[]; sheetGeneration: { cost: number; enabled: boolean }; initialEdit: string | null }) {
  const [focus, setFocus] = useState<string | null>(initialEdit);
  const voiceName = (id: string | null) => (id ? (voices.find((v) => v.id === id)?.name ?? null) : null);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {spaces.map((s) => (
          <article key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="h-1.5" style={{ background: s.color }} />
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-bold">{s.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {s.projectCount} projet{s.projectCount > 1 ? "s" : ""} · {s.publishedCount} publié{s.publishedCount > 1 ? "s" : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFocus(s.id)}><Pencil /> Modifier</Button>
              </div>

              <button type="button" onClick={() => setFocus(s.id)} className="flex aspect-[16/7] items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]" aria-label={`Image de référence de ${s.name}`}>
                {s.characterImage ? (
                  <img src={s.characterImage} alt={`Personnages de ${s.name}`} className="h-full w-full bg-white object-contain" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground"><ImagePlus className="h-5 w-5" /> Ajouter les personnages</span>
                )}
              </button>

              <p className={s.brief ? "line-clamp-3 text-sm text-muted-foreground" : "text-sm italic text-muted-foreground/70"}>{s.brief ?? "Pas encore de Thématique : décris de quoi parle ce compte pour que l'IA écrive dans son sens."}</p>

              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5"><Mic2 className="h-3 w-3" /> {voiceName(s.voiceId) ?? "Voix par défaut"}</span>
                {s.tone && <span className="rounded-full border border-white/10 px-2 py-0.5">Ton {TONE_LABELS[s.tone as Tone]?.toLowerCase() ?? s.tone}</span>}
                {s.language && <span className="rounded-full border border-white/10 px-2 py-0.5">{LANGUAGE_LABELS[s.language] ?? s.language}</span>}
                <Link href="/lessons" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 hover:text-foreground"><Lightbulb className="h-3 w-3" /> {s.lessonCount} leçon{s.lessonCount > 1 ? "s" : ""}</Link>
              </div>

              <div className="mt-auto grid grid-cols-2 gap-2">
                <Button asChild variant="gradient" size="sm"><Link href={`/scripts?space=${s.id}`}><Clapperboard /> Nouvelle vidéo</Link></Button>
                <Button asChild variant="secondary" size="sm"><Link href={`/scripts?space=${s.id}&format=carousel`}><GalleryHorizontalEnd /> Nouveau carrousel</Link></Button>
              </div>
              <Link href={`/projects?espace=${s.id}&vue=all`} className="text-center text-xs text-muted-foreground transition hover:text-foreground">Voir ses projets</Link>
            </div>
          </article>
        ))}

        <button type="button" onClick={() => setFocus("new")} className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 p-6 text-sm text-muted-foreground transition hover:border-white/30 hover:text-foreground">
          <Plus className="h-6 w-6" />
          Nouvel espace
          <span className="max-w-60 text-center text-xs">Un compte TikTok ou Instagram, une marque, un thème : chacun garde son sujet, ses personnages et sa voix.</span>
        </button>
      </div>

      <SpaceManagerDialog spaces={spaces} voices={voices} open={focus !== null} onOpenChange={(v) => { if (!v) setFocus(null); }} sheetGeneration={sheetGeneration} focus={focus} />
    </>
  );
}
