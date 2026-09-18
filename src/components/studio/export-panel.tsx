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
import type { StudioRender, StudioProps } from "@/components/studio/types";
import { cn, relativeTime } from "@/lib/utils";

interface Props {
  projectId: string;
  renders: StudioRender[];
  planLimits: StudioProps["planLimits"];
  credits: number;
  hasScript: boolean;
  hasVoiceover: boolean;
  dirty: boolean;
}

type Live = { status: string; progress: number; step: string; stepLabel: string; outputUrl: string | null; thumbnailUrl: string | null; error: string | null };

export function ExportPanel({ projectId, renders, planLimits, credits, hasScript, hasVoiceover, dirty }: Props) {
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
        if (data.status === "COMPLETED") toast.success("Render complete! Your MP4 is ready.");
        if (data.status === "FAILED") toast.error("Render failed. Credits were refunded.");
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
    if (dirty) toast.info("Saving latest edits before rendering…");
    setLoading(true);
    const res = await enqueueRender({ projectId, resolution });
    setLoading(false);
    if (!res.ok) return toast.error(res.error, { action: res.code === "INSUFFICIENT_CREDITS" ? { label: "Get credits", onClick: () => router.push("/billing") } : undefined });
    toast.success(`Render queued (${res.data.resolution}) · ${res.data.creditsCharged} credits`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Label>Resolution</Label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["720p", "1080p", "4K"] as const).map((r) => {
            const locked = RES_RANK[r] > RES_RANK[planLimits.maxResolution];
            return (
              <button key={r} type="button" disabled={locked} onClick={() => setResolution(r)} className={cn("rounded-lg border p-3 text-center transition disabled:opacity-50", resolution === r ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                <p className="font-semibold">{r} {locked && <Lock className="inline h-3 w-3" />}</p>
                <p className="text-[11px] text-muted-foreground">{planLimits.costs[r]} credits</p>
              </button>
            );
          })}
        </div>
        {planLimits.watermark && <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" /> Free plan exports include a watermark. <Link href="/billing" className="underline">Upgrade</Link> to remove.</p>}
      </div>

      {!hasVoiceover && hasScript && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">No voiceover yet — the render will be silent with estimated caption timing. Generate one in the Audio tab for best results.</p>}

      {activeRender ? (
        <div className="surface p-4">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Rendering…</p><StatusBadge status={live?.status ?? activeRender.status} /></div>
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
          <p className="mt-3 text-[11px] text-muted-foreground">Renders run in the background worker. You can leave this page.</p>
        </div>
      ) : (
        <Button className="w-full" size="lg" variant="gradient" onClick={render} loading={loading} disabled={!hasScript || credits < cost}>
          <Film /> Render {resolution} · <Coins className="h-3.5 w-3.5" /> {cost}
        </Button>
      )}
      {credits < cost && !activeRender && <p className="text-center text-[11px] text-red-300">Not enough credits ({credits}/{cost}). <Link href="/billing" className="underline">Top up</Link>.</p>}

      {hasVoiceover && <Button asChild variant="outline" className="w-full"><a href={`/api/projects/${projectId}/captions`}><Subtitles /> Download captions (.srt)</a></Button>}

      {renders.length > 0 && (
        <div>
          <Label>Recent renders</Label>
          <ul className="mt-2 space-y-2">
            {renders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-white/5">{r.thumbnailUrl && <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1"><p className="text-xs font-medium">{r.width}×{r.height}</p><p className="text-[11px] text-muted-foreground">{relativeTime(r.createdAt)} · {r.creditsCharged} cr</p></div>
                <StatusBadge status={r.status} />
                {r.status === "COMPLETED" && r.outputUrl && (
                  <>
                    <Button asChild size="icon-sm" variant="ghost"><a href={r.outputUrl} download target="_blank" rel="noreferrer"><Download /></a></Button>
                    <Button asChild size="icon-sm" variant="ghost"><Link href="/exports"><Send /></Link></Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
