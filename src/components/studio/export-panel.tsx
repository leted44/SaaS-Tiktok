"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Film, Download, Send, Lock, Coins, Subtitles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { enqueueRender } from "@/server/actions/renders";
import { RENDER_STEPS } from "@/lib/render/queue";
import { SocialCopyBlock } from "@/components/studio/social-copy";
import type { SocialCopy } from "@/lib/social/captions";
import type { StudioRender, StudioProps, RenderTimingsView } from "@/components/studio/types";
import { cn, relativeTime } from "@/lib/utils";

interface Props {
  projectId: string;
  renders: StudioRender[];
  planLimits: StudioProps["planLimits"];
  credits: number;
  hasScript: boolean;
  hasVoiceover: boolean;
  dirty: boolean;
  scriptId: string | null;
  socialCopy: SocialCopy | null;
  hashtags: string[];
  aiConfigured: boolean;
}

type Live = { status: string; progress: number; step: string; stepLabel: string; outputUrl: string | null; thumbnailUrl: string | null; error: string | null };

export function ExportPanel({ projectId, renders, planLimits, credits, hasScript, hasVoiceover, dirty, scriptId, socialCopy, hashtags, aiConfigured }: Props) {
  const router = useRouter();
  const [resolution, setResolution] = useState<"720p" | "1080p" | "4K">(planLimits.maxResolution === "720p" ? "720p" : "1080p");
  const [loading, setLoading] = useState(false);
  const activeRender = renders.find((r) => r.status === "QUEUED" || r.status === "PROCESSING") ?? null;
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    if (!activeRender) { setLive(null); return; }
    let stopped = false;
    const poll = async () => {
      const res = await fetch(`/api/renders/${activeRender.id}`, { cache: "no-store" });
      if (!res.ok || stopped) return;
      const data = (await res.json()) as Live;
      setLive(data);
      if (data.status === "COMPLETED" || data.status === "FAILED" || data.status === "CANCELLED") {
        if (data.status === "COMPLETED") toast.success("Rendu terminé ! Votre MP4 est prêt.");
        if (data.status === "FAILED") toast.error("Le rendu a échoué. Les crédits ont été remboursés.");
        router.refresh();
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { stopped = true; clearInterval(t); };
  }, [activeRender, router]);

  const cost = planLimits.costs[resolution];
  const RES_RANK = { "720p": 0, "1080p": 1, "4K": 2 };

  async function render() {
    if (dirty) toast.info("Enregistrement des dernières modifications avant le rendu…");
    setLoading(true);
    const res = await enqueueRender({ projectId, resolution });
    setLoading(false);
    if (!res.ok) return toast.error(res.error, { action: res.code === "INSUFFICIENT_CREDITS" ? { label: "Obtenir des crédits", onClick: () => router.push("/billing") } : undefined });
    toast.success(`Rendu mis en file (${res.data.resolution}) · ${res.data.creditsCharged} crédits`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Label>Résolution</Label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["720p", "1080p", "4K"] as const).map((r) => {
            const locked = RES_RANK[r] > RES_RANK[planLimits.maxResolution];
            return (
              <button key={r} type="button" disabled={locked} onClick={() => setResolution(r)} className={cn("rounded-lg border p-3 text-center transition disabled:opacity-50", resolution === r ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                <p className="font-semibold">{r} {locked && <Lock className="inline h-3 w-3" />}</p>
                <p className="text-[11px] text-muted-foreground">{planLimits.costs[r]} crédits</p>
              </button>
            );
          })}
        </div>
        {planLimits.watermark && <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" /> Les exports du forfait gratuit incluent un filigrane. <Link href="/billing" className="underline">Passez à un forfait supérieur</Link> pour le retirer.</p>}
      </div>

      {!hasVoiceover && hasScript && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Pas encore de voix off — le rendu sera silencieux avec un timing de sous-titres estimé. Générez-en une dans l'onglet Audio pour un meilleur résultat.</p>}

      {activeRender ? (
        <div className="surface min-w-0 overflow-hidden p-4">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Rendu en cours…</p><StatusBadge status={live?.status ?? activeRender.status} /></div>
          <Progress value={live?.progress ?? activeRender.progress} className="mt-3 h-2" indicatorClassName="bg-brand-gradient" />
          <ol className="mt-4 space-y-1.5">
            {RENDER_STEPS.filter((s) => s.key !== "done").map((s) => {
              const current = (live?.step ?? activeRender.step) === s.key;
              const passed = (live?.progress ?? activeRender.progress) > s.progress && !current;
              return (
                <li key={s.key} className={cn("flex items-center gap-2 text-xs", current ? "text-foreground" : passed ? "text-emerald-300" : "text-muted-foreground/60")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", current ? "animate-pulse bg-primary" : passed ? "bg-emerald-400" : "bg-white/15")} />
                  {s.label}{current && ` · ${live?.progress ?? activeRender.progress}%`}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[11px] text-muted-foreground">Les rendus s'exécutent dans le worker en arrière-plan. Vous pouvez quitter cette page.</p>
          {live?.status === "FAILED" && live.error && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-200">{live.error}</p>}
        </div>
      ) : (
        <Button className="w-full" size="lg" variant="gradient" onClick={render} loading={loading} disabled={!hasScript || credits < cost}>
          <Film /> Rendu {resolution} · <Coins className="h-3.5 w-3.5" /> {cost}
        </Button>
      )}
      {credits < cost && !activeRender && <p className="text-center text-[11px] text-red-300">Crédits insuffisants ({credits}/{cost}). <Link href="/billing" className="underline">Recharger</Link>.</p>}

      {hasVoiceover && <Button asChild variant="outline" className="w-full"><a href={`/api/projects/${projectId}/captions`}><Subtitles /> Télécharger les sous-titres (.srt)</a></Button>}

      {socialCopy && scriptId && (
        <SocialCopyBlock scriptId={scriptId} copy={socialCopy} hashtags={hashtags} cost={planLimits.costs.socialCopy} aiConfigured={aiConfigured} />
      )}

      {renders.length > 0 && (
        <div>
          <Label>Rendus récents</Label>
          <ul className="mt-2 space-y-2">
            {renders.map((r) => (
              <li key={r.id} className="min-w-0 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-white/5">{r.thumbnailUrl && <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1"><p className="text-xs font-medium">{r.width}×{r.height}</p><p className="text-[11px] text-muted-foreground">{relativeTime(r.createdAt)} · {r.creditsCharged} cr</p></div>
                  <StatusBadge status={r.status} />
                  {r.status === "COMPLETED" && r.outputUrl && (
                    <>
                      <Button asChild size="icon-sm" variant="ghost"><a href={r.outputUrl} download target="_blank" rel="noreferrer"><Download /></a></Button>
                      <Button asChild size="icon-sm" variant="ghost"><Link href="/exports"><Send /></Link></Button>
                    </>
                  )}
                </div>
                {r.status === "FAILED" && r.error && <p className="mt-2 whitespace-pre-wrap break-words rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-200">{r.error}</p>}
                {r.timings && <RenderTimings t={r.timings} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);

/** Remotion's own breakdown of where a render spent its time. */
function RenderTimings({ t }: { t: RenderTimingsView }) {
  return (
    <details className="mt-2 rounded border border-white/[0.06] bg-white/[0.02] p-2">
      <summary className="cursor-pointer text-[11px] text-muted-foreground">Détail du temps · total {secs(t.totalMs)}</summary>
      <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        <li>Rendu des images : <span className="text-foreground">{secs(t.renderFramesMs)}</span></li>
        <li>Encodage : <span className="text-foreground">{secs(t.encodeMs)}</span></li>
        <li>Assemblage : <span className="text-foreground">{secs(t.combineMs)}</span></li>
        <li>Morceaux : <span className="text-foreground">{t.chunks}</span> · Lambdas : <span className="text-foreground">{t.lambdasInvoked}</span> · Relances : <span className={t.retries > 0 ? "text-amber-300" : "text-foreground"}>{t.retries}</span></li>
        {t.slowestChunk && (
          <li>
            Morceau le plus lent : <span className="text-foreground">images {t.slowestChunk.frames[0]}–{t.slowestChunk.frames[1]} en {secs(t.slowestChunk.ms)}</span>
          </li>
        )}
      </ul>
    </details>
  );
}
