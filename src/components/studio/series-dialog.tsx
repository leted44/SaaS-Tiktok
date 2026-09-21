"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers3, Coins, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { splitIntoSeriesAction, type SeriesEpisodeSummary } from "@/server/actions/scripts";
import { cn } from "@/lib/utils";

const PART_OPTIONS = [2, 3, 4] as const;

interface Props {
  scriptId: string;
  /** Credit price of one episode — zero for accounts that aren't charged. */
  costPerEpisode: number;
  aiConfigured: boolean;
}

export function SeriesDialog({ scriptId, costPerEpisode, aiConfigured }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<number>(3);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ seriesTitle: string; episodes: SeriesEpisodeSummary[] } | null>(null);

  async function split() {
    setLoading(true);
    const res = await splitIntoSeriesAction(scriptId, parts);
    setLoading(false);
    if (!res.ok) return toast.error(res.error);
    setDone({ seriesTitle: res.data.seriesTitle, episodes: res.data.episodes });
    toast.success(`Série « ${res.data.seriesTitle} » créée — ${res.data.episodes.length} épisodes.`);
    router.refresh();
  }

  function close(next: boolean) {
    setOpen(next);
    // Reset only once shut, so the result list doesn't vanish mid-animation.
    if (!next) setTimeout(() => setDone(null), 200);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" disabled={!aiConfigured}><Layers3 /> Transformer en série</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> {done.seriesTitle}</DialogTitle>
              <DialogDescription>
                {done.episodes.length} projets créés, un par épisode. Publiez-les à un jour d&apos;intervalle : c&apos;est l&apos;attente entre deux épisodes qui transforme un spectateur en abonné.
              </DialogDescription>
            </DialogHeader>
            <ul className="mt-2 space-y-2">
              {done.episodes.map((e) => (
                <li key={e.projectId}>
                  <Link
                    href={`/studio/${e.projectId}`}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-primary/40"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-brand-300">{e.episodeNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">⚡{e.viralityScore}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Transformer en série</DialogTitle>
              <DialogDescription>
                L&apos;IA redécoupe ce sujet en épisodes, chacun avec son propre angle et une fin en suspens qui annonce le suivant. Chaque épisode devient un projet à part, prêt à monter et à publier.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2">
              <p className="text-xs text-muted-foreground">Nombre d&apos;épisodes</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PART_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setParts(n)}
                    className={cn(
                      "rounded-lg border p-3 text-center transition",
                      parts === n ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20",
                    )}
                  >
                    <p className="font-semibold">{n}</p>
                    <p className="text-[11px] text-muted-foreground">épisodes</p>
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-muted-foreground">
              Crée <span className="text-foreground">{parts} nouveaux projets</span>
              {costPerEpisode > 0 && (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-1 text-foreground"><Coins className="h-3 w-3" /> {costPerEpisode * parts} crédits</span>
                </>
              )}
              . Ce script-ci n&apos;est pas modifié.
            </p>

            <Button className="mt-3 w-full" variant="gradient" onClick={split} loading={loading}>
              <Layers3 /> Créer la série
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
