import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, FolderKanban, Film, Send, ArrowRight, Clock, Coins, Plus } from "lucide-react";
import { getDashboardData } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { UsageChart } from "@/components/dashboard/usage-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { relativeTime, formatNumber } from "@/lib/utils";
import { CREDIT_COSTS } from "@/lib/plans";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, workspace, projects, renders, usage, scheduled, plan, totals } = await getDashboardData();
  const firstName = (user.name ?? "Creator").split(" ")[0];
  const creditsPct = Math.min(100, Math.round((user.credits / Math.max(1, plan.monthlyCredits)) * 100));
  const videosLeft = Math.floor(user.credits / (CREDIT_COSTS.SCRIPT_GENERATION + CREDIT_COSTS.VOICEOVER_PER_30S * 2 + CREDIT_COSTS.RENDER_1080P));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Good to see you, ${firstName}.`}
        description={`${workspace.name} · ${plan.name} plan · ${formatNumber(user.credits)} credits (~${videosLeft} more videos)`}
        actions={
          <Button asChild variant="gradient"><Link href="/scripts"><Sparkles /> New video</Link></Button>
        }
      />

      {user.credits < 12 && <div className="mb-6"><UpgradePrompt title={user.credits === 0 ? "You're out of credits" : "Running low on credits"} body={`${user.credits} left. A full video costs about 15 credits.`} compact /></div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={FolderKanban} label="Projects" value={totals.projects} hint="all time" />
        <StatTile icon={Sparkles} label="Scripts generated" value={totals.scripts} hint="all time" />
        <StatTile icon={Film} label="Videos rendered" value={totals.renders} hint="completed" />
        <StatTile icon={Send} label="Posts published" value={totals.published} hint="across platforms" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent projects</CardTitle>
              <CardDescription>Pick up where you left off.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm"><Link href="/projects">View all <ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <EmptyState icon={Sparkles} title="No projects yet" description="Generate your first script and we'll create the project for you." action={<Button asChild variant="gradient"><Link href="/scripts"><Plus /> Generate a script</Link></Button>} className="border-dashed py-10 shadow-none" />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/studio/${p.id}`} className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.03]">
                      <div className="h-14 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-brand-gradient-soft">
                        {p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium group-hover:text-brand-200">{p.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.niche || p.topic || "No topic"} · {relativeTime(p.updatedAt)}</p>
                      </div>
                      {p.scripts[0] && <span className="hidden text-xs text-muted-foreground sm:block">Virality <b className="text-foreground">{p.scripts[0].viralityScore}</b></span>}
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4 text-brand-300" /> Credits</CardTitle>
              <CardDescription>{user.credits} of {plan.monthlyCredits} monthly</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={creditsPct} indicatorClassName={creditsPct < 20 ? "bg-amber-400" : "bg-brand-gradient"} />
              <UsageChart usage={usage.byType} />
              <p className="mt-3 text-xs text-muted-foreground">{usage.totalUsed} credits used in the last 30 days.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-300" /> Upcoming posts</CardTitle>
            </CardHeader>
            <CardContent>
              {scheduled.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled. <Link href="/exports" className="text-foreground underline-offset-4 hover:underline">Schedule a post</Link>.</p>
              ) : (
                <ul className="space-y-3">
                  {scheduled.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 text-sm">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground"><PlatformIcon platform={s.platform} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.project.title}</p>
                        <p className="text-xs text-muted-foreground">@{s.socialAccount.username} · {new Date(s.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Render activity</CardTitle>
            <CardDescription>Latest exports from the render queue.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm"><Link href="/exports">Open exports <ArrowRight /></Link></Button>
        </CardHeader>
        <CardContent>
          {renders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No renders yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {renders.map((r) => (
                <div key={r.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{r.project.title}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.status === "PROCESSING" || r.status === "QUEUED" ? (
                    <Progress value={r.progress} className="mt-3 h-1.5" />
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{relativeTime(r.createdAt)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
