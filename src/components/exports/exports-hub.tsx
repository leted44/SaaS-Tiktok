"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Film, Download, Send, Trash2, XCircle, RefreshCw, Link2, Unplug, CalendarClock, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PlatformIcon, PLATFORM_LABEL } from "@/components/shared/platform-icon";
import { PublishDialog } from "@/components/exports/publish-dialog";
import { cancelRender, deleteRender } from "@/server/actions/renders";
import { cancelPublish, retryPublish, disconnectSocialAccount } from "@/server/actions/publish";
import { formatBytes, formatDuration, relativeTime, cn } from "@/lib/utils";
import { RENDER_STEPS } from "@/lib/render/queue";

export interface RenderItem {
  id: string; status: string; progress: number; step: string; outputUrl: string | null; thumbnailUrl: string | null; sizeBytes: number | null; durationMs: number | null; width: number; height: number; error: string | null; createdAt: string; creditsCharged: number; project: { id: string; title: string; aspectRatio: string }; publishCount: number;
}
export interface PublishItem {
  id: string; status: string; platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE"; scheduledAt: string; publishedAt: string | null; caption: string; externalUrl: string | null; error: string | null; projectTitle: string; username: string; thumbnailUrl: string | null;
}
export interface AccountItem { id: string; platform: "TIKTOK" | "INSTAGRAM" | "YOUTUBE"; username: string; displayName: string | null; avatarUrl: string | null; expiresAt: string | null }

interface Props {
  renders: RenderItem[];
  publishJobs: PublishItem[];
  accounts: AccountItem[];
  platforms: { tiktok: boolean; youtube: boolean; instagram: boolean };
  schedulingAllowed: boolean;
  maxAccounts: number;
  flash: { connected?: string; error?: string };
}

export function ExportsHub({ renders, publishJobs, accounts, platforms, schedulingAllowed, maxAccounts, flash }: Props) {
  const router = useRouter();
  const [publishFor, setPublishFor] = useState<RenderItem | null>(null);
  const hasActive = renders.some((r) => r.status === "QUEUED" || r.status === "PROCESSING");

  useEffect(() => {
    if (flash.connected) toast.success(`Connected ${flash.connected.replace(":", " @")}`);
    if (flash.error) toast.error(flash.error);
    if (flash.connected || flash.error) router.replace("/exports");
  }, [flash.connected, flash.error, router]);

  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [hasActive, router]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    const res = await fn();
    if (!res.ok) return toast.error(res.error);
    toast.success(success);
    router.refresh();
  }

  return (
    <>
      <Tabs defaultValue="renders">
        <TabsList>
          <TabsTrigger value="renders"><Film /> Renders <span className="text-xs text-muted-foreground">({renders.length})</span></TabsTrigger>
          <TabsTrigger value="posts"><CalendarClock /> Posts <span className="text-xs text-muted-foreground">({publishJobs.length})</span></TabsTrigger>
          <TabsTrigger value="accounts"><Link2 /> Accounts <span className="text-xs text-muted-foreground">({accounts.length})</span></TabsTrigger>
        </TabsList>

        <TabsContent value="renders">
          {renders.length === 0 ? (
            <EmptyState icon={Film} title="No renders yet" description="Open a project in the studio and hit Render to queue your first export." action={<Button asChild variant="gradient"><Link href="/projects">Go to projects</Link></Button>} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {renders.map((r) => {
                const stepLabel = RENDER_STEPS.find((s) => s.key === r.step)?.label ?? r.step;
                const active = r.status === "QUEUED" || r.status === "PROCESSING";
                return (
                  <div key={r.id} className={cn("surface flex gap-4 p-4", active && "border-primary/30")}>
                    <div className="h-32 w-[72px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(160deg,#2a1657,#0B0714)]">
                      {r.thumbnailUrl ? <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/20"><Film className="h-6 w-6" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/studio/${r.project.id}`} className="truncate font-semibold hover:text-brand-200">{r.project.title}</Link>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{r.width}×{r.height} · {relativeTime(r.createdAt)} · {r.creditsCharged} cr</p>
                      {active && (
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{stepLabel}</span><span className="tabular-nums">{r.progress}%</span></div>
                          <Progress value={r.progress} className="h-1.5" indicatorClassName="bg-brand-gradient" />
                        </div>
                      )}
                      {r.status === "COMPLETED" && <p className="mt-2 text-xs text-muted-foreground">{r.durationMs ? formatDuration(r.durationMs) : ""} · {r.sizeBytes ? formatBytes(r.sizeBytes) : ""} {r.publishCount > 0 && `· ${r.publishCount} post${r.publishCount > 1 ? "s" : ""}`}</p>}
                      {r.status === "FAILED" && <p className="mt-2 line-clamp-2 text-xs text-red-300">{r.error?.split("\n")[0]}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.status === "COMPLETED" && r.outputUrl && (
                          <>
                            <Button asChild size="sm" variant="secondary"><a href={r.outputUrl} download target="_blank" rel="noreferrer"><Download /> MP4</a></Button>
                            <Button size="sm" variant="gradient" onClick={() => setPublishFor(r)}><Send /> Publish</Button>
                          </>
                        )}
                        {r.status === "QUEUED" && <Button size="sm" variant="outline" onClick={() => run(() => cancelRender(r.id), "Render cancelled and credits refunded")}><XCircle /> Cancel</Button>}
                        {(r.status === "COMPLETED" || r.status === "FAILED" || r.status === "CANCELLED") && (
                          <Button size="sm" variant="ghost" onClick={() => confirm("Delete this render?") && run(() => deleteRender(r.id), "Render deleted")}><Trash2 /></Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="posts">
          {publishJobs.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No posts scheduled" description="Publish a completed render to TikTok, Reels or Shorts — instantly or on a schedule." />
          ) : (
            <div className="surface divide-y divide-white/[0.05]">
              {publishJobs.map((p) => (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-14 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/5">{p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />}</div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]"><PlatformIcon platform={p.platform} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.projectTitle} <span className="text-xs text-muted-foreground">→ @{p.username}</span></p>
                    <p className="truncate text-xs text-muted-foreground">{p.status === "PUBLISHED" && p.publishedAt ? `Published ${relativeTime(p.publishedAt)}` : `Scheduled ${new Date(p.scheduledAt).toLocaleString()}`}{p.error && ` · ${p.error}`}</p>
                  </div>
                  <StatusBadge status={p.status} />
                  <div className="flex gap-1">
                    {p.externalUrl && <Button asChild size="icon-sm" variant="ghost"><a href={p.externalUrl} target="_blank" rel="noreferrer"><ExternalLink /></a></Button>}
                    {p.status === "FAILED" && <Button size="icon-sm" variant="ghost" onClick={() => run(() => retryPublish(p.id), "Retrying")}><RefreshCw /></Button>}
                    {(p.status === "SCHEDULED" || p.status === "FAILED") && <Button size="icon-sm" variant="ghost" onClick={() => run(() => cancelPublish(p.id), "Post cancelled")}><XCircle /></Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="accounts">
          <div className="grid gap-4 md:grid-cols-3">
            {(["TIKTOK", "INSTAGRAM", "YOUTUBE"] as const).map((platform) => {
              const key = platform.toLowerCase() as keyof typeof platforms;
              const configured = platforms[key];
              const connected = accounts.filter((a) => a.platform === platform);
              const atLimit = maxAccounts > 0 && accounts.length >= maxAccounts;
              return (
                <div key={platform} className="surface p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05]"><PlatformIcon platform={platform} className="h-5 w-5" /></span>
                      <div>
                        <p className="font-semibold">{PLATFORM_LABEL[platform]}</p>
                        <p className="text-xs text-muted-foreground">{connected.length} connected</p>
                      </div>
                    </div>
                    {!configured && <Badge variant="secondary">Not configured</Badge>}
                  </div>
                  <ul className="mt-4 space-y-2">
                    {connected.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                        <div className="h-8 w-8 overflow-hidden rounded-full bg-brand-gradient">{a.avatarUrl && <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">@{a.username}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{a.expiresAt && new Date(a.expiresAt) < new Date() ? "Token expired — reconnect" : a.displayName ?? ""}</p>
                        </div>
                        <Button size="icon-sm" variant="ghost" onClick={() => confirm(`Disconnect @${a.username}?`) && run(() => disconnectSocialAccount(a.id), "Account disconnected")}><Unplug /></Button>
                      </li>
                    ))}
                  </ul>
                  <Button asChild={configured && !atLimit} size="sm" variant="secondary" className="mt-4 w-full" disabled={!configured || atLimit}>
                    {configured && !atLimit ? <a href={`/api/social/${key}/connect`}><Plus /> Connect account</a> : <span>{atLimit ? "Plan limit reached" : "Add API keys to enable"}</span>}
                  </Button>
                </div>
              );
            })}
          </div>
          {maxAccounts > 0 && <p className="mt-4 text-xs text-muted-foreground">Your plan allows {maxAccounts} connected account{maxAccounts > 1 ? "s" : ""}. <Link href="/billing" className="text-foreground underline-offset-4 hover:underline">Upgrade</Link> for more.</p>}
        </TabsContent>
      </Tabs>

      <PublishDialog render={publishFor} accounts={accounts} schedulingAllowed={schedulingAllowed} onClose={() => setPublishFor(null)} onDone={() => { setPublishFor(null); router.refresh(); }} />
    </>
  );
}
