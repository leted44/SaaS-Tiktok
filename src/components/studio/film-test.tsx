"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Download, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearFilmAction, startFilmAction } from "@/server/actions/film";
import { filmLayer, FILM_MAX_SECONDS, FILM_USD_PER_SECOND } from "@/lib/video-clips/film";
import type { VisualLayer } from "@/lib/validations";

/**
 * Admin test « Film en une fois » (lib/video-clips/film), shown in Visuels on
 * a silent mini-film while « Mode test » is on: Kling 3 draws the whole film
 * in one generation, from the hook's image, the script's shots and the
 * project's character images. The film then replaces the images on the
 * video; « Revenir aux images » puts them back. Nothing else in the studio
 * changes.
 */
export function FilmTest({ projectId, film, filmJobId, durationMs, onLayersChange, ensureSaved }: {
  projectId: string;
  film: { src: string; seconds: number } | null;
  filmJobId: string | null;
  /** The video's length now, for the price shown before generating. */
  durationMs: number;
  onLayersChange: (layers: VisualLayer[]) => void;
  ensureSaved: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState(filmJobId);
  const [busy, setBusy] = useState<"start" | "clear" | null>(null);
  const seconds = Math.min(FILM_MAX_SECONDS, Math.max(3, Math.round(durationMs / 1000)));
  const price = (seconds * FILM_USD_PER_SECOND).toFixed(2).replace(".", ",");

  // Each poll moves the job one step (see /api/video-clips/[id]); the film lands on the video server-side.
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    const poll = async () => {
      const res = await fetch(`/api/video-clips/${jobId}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || stopped) return;
      const data = (await res.json()) as { status: string; resultUrl: string | null; error: string | null };
      if (data.status === "COMPLETED" && data.resultUrl) {
        stopped = true;
        setJobId(null);
        toast.success("Film prêt : il remplace les images de la vidéo.");
        router.refresh();
      } else if (data.status === "FAILED") {
        stopped = true;
        setJobId(null);
        toast.error(data.error ? `Film impossible : ${data.error}` : "Le film a échoué.", { duration: 15000 });
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => { stopped = true; clearInterval(t); };
  }, [jobId, router]);

  // The page's own state follows the film once it is on, so an autosave never puts the images back over it.
  useEffect(() => {
    if (film) onLayersChange([filmLayer(film.src, [film.seconds * 1000])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film?.src]);

  async function start() {
    if (!(await ensureSaved())) return;
    setBusy("start");
    const res = await startFilmAction(projectId);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error, { duration: 12000 });
    setJobId(res.data.jobId);
    toast.info(`Film lancé : ${res.data.shots} plans, ${res.data.seconds} s. Compte 3 à 8 minutes.`);
  }

  async function clear() {
    setBusy("clear");
    const res = await clearFilmAction(projectId);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    onLayersChange(res.data.layers);
    toast.success("Images remises sur la vidéo.");
    router.refresh();
  }

  return (
    <div className="mb-4 space-y-2.5 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200"><Clapperboard className="h-3.5 w-3.5" /> Test admin · Film en une fois (Kling 3 Pro)</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Kling dessine tout le mini-film d&apos;un coup : la 1re image est celle de l&apos;accroche, un plan par partie du script (6 au plus, {FILM_MAX_SECONDS} s au plus), et tes images de référence gardent les personnages identiques. Sans son. Le film remplace les images ; « Revenir aux images » les remet.
      </p>
      {film && (
        <div className="space-y-2">
          <video src={film.src} controls playsInline className="mx-auto max-h-80 rounded-lg bg-black" />
          <div className="flex flex-wrap gap-1.5">
            <Button asChild size="sm" variant="secondary"><a href={film.src} download={`film-${projectId}.mp4`}><Download /> Télécharger le film</a></Button>
            <Button size="sm" variant="ghost" loading={busy === "clear"} disabled={busy !== null || Boolean(jobId)} onClick={clear}><RotateCcw /> Revenir aux images</Button>
          </div>
        </div>
      )}
      {jobId ? (
        <p className="flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Film en cours… tu peux quitter la page, il continue.</p>
      ) : (
        <Button size="sm" variant="secondary" className="w-full" loading={busy === "start"} disabled={busy !== null} onClick={start}>
          <Clapperboard /> {film ? "Regénérer le film" : "Générer le film"} · ≈ {seconds} s · ≈ {price} $ sur fal
        </Button>
      )}
    </div>
  );
}
