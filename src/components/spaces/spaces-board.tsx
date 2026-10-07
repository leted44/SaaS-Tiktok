"use client";

import { RESULTS_ENABLED } from "@/lib/results/config";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clapperboard, GalleryHorizontalEnd, ImagePlus, Lightbulb, Mic2, Palette, Pencil, Plus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpaceManagerDialog } from "@/components/projects/space-manager-dialog";
import { TONE_LABELS, type Tone } from "@/lib/autopilot/template-shared";
import { LANGUAGE_LABELS } from "@/lib/tts/voices";
import type { SpaceOption } from "@/lib/spaces";
import type { SpaceLookView } from "@/server/queries";
import { clearSpaceLookAction } from "@/server/actions/space-kit";

type SpaceCard = SpaceOption & { publishedCount: number; lessonCount: number; look: SpaceLookView };

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
                {RESULTS_ENABLED && <Link href="/lessons" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 hover:text-foreground"><Lightbulb className="h-3 w-3" /> {s.lessonCount} leçon{s.lessonCount > 1 ? "s" : ""}</Link>}
              </div>

              <SpaceLook spaceId={s.id} look={s.look} />

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

/**
 * The space's look (lib/space-kit) on its card: what every new video and
 * carousel of it starts with. Set on its own page (/spaces/[id]/rendu), or
 * taken from a post with the studio's and carousel editor's « Rendu de
 * l'espace ».
 */
function SpaceLook({ spaceId, look }: { spaceId: string; look: SpaceLookView }) {
  const router = useRouter();
  const [clearing, setClearing] = useState<"video" | "carousel" | null>(null);
  async function clear(part: "video" | "carousel") {
    setClearing(part);
    const res = await clearSpaceLookAction(spaceId, part);
    setClearing(null);
    if (!res.ok) return toast.error(res.error);
    toast.success("Rendu retiré : les nouveaux posts repartent des réglages par défaut.");
    router.refresh();
  }
  const rows = [
    { part: "video" as const, label: "Vidéos", icon: Clapperboard, saved: look.video, href: (id: string) => `/studio/${id}` },
    { part: "carousel" as const, label: "Carrousels", icon: GalleryHorizontalEnd, saved: look.carousel, href: (id: string) => `/studio/${id}/carousel` },
  ];
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold"><Palette className="h-3.5 w-3.5" /> Rendu de l&apos;espace</p>
        <Button asChild variant="secondary" size="sm" className="h-7 px-2.5 text-[11px]"><Link href={`/spaces/${spaceId}/rendu`}><SlidersHorizontal /> Régler</Link></Button>
      </div>
      <div className="mt-2 space-y-2">
        {rows.map(({ part, label, icon: Icon, saved, href }) => (
          <div key={part} className="text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
              {saved && (
                <button type="button" disabled={clearing === part} onClick={() => clear(part)} className="inline-flex items-center gap-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-50" aria-label={`Retirer le rendu des ${label.toLowerCase()}`}>
                  <X className="h-3 w-3" /> Retirer
                </button>
              )}
            </div>
            {saved ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {saved.summary.map((t) => (
                  <span key={t} className="rounded-full border border-white/10 px-2 py-0.5">{t}</span>
                ))}
                {saved.projectId && <Link href={href(saved.projectId)} className="px-1 py-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Voir le modèle</Link>}
              </div>
            ) : (
              <p className="mt-0.5 text-muted-foreground/80">Pas encore réglé : touche « Régler » pour choisir {part === "carousel" ? "le modèle, le format et la couleur" : "la voix, les sous-titres, la musique et la couverture"}.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
