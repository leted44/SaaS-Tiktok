import type { Metadata } from "next";
import { getExportsData } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { ExportsHub } from "@/components/exports/exports-hub";
import { integrations } from "@/lib/env";
import { effectivePlanDef } from "@/lib/plans";
import { queueStats } from "@/lib/render/queue";

export const metadata: Metadata = { title: "Exports & publication" };
export const dynamic = "force-dynamic";

export default async function ExportsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const [params, data, stats] = await Promise.all([searchParams, getExportsData(), queueStats()]);
  const plan = effectivePlanDef(data.user);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Centre d'exports & de publication" description={`File de rendu : ${stats.queued} en attente · ${stats.processing} en cours. Téléchargez vos MP4 ou programmez des publications sur toutes les plateformes.`} />
      <ExportsHub
        renders={data.renders.map((r) => ({ id: r.id, status: r.status, progress: r.progress, step: r.step, outputUrl: r.outputUrl, thumbnailUrl: r.thumbnailUrl, sizeBytes: r.sizeBytes, durationMs: r.durationMs, width: r.width, height: r.height, error: r.error, createdAt: r.createdAt.toISOString(), creditsCharged: r.creditsCharged, project: r.project, publishCount: r.publishJobs.length }))}
        publishJobs={data.publishJobs.map((p) => ({ id: p.id, status: p.status, platform: p.platform, scheduledAt: p.scheduledAt.toISOString(), publishedAt: p.publishedAt?.toISOString() ?? null, caption: p.caption, externalUrl: p.externalUrl, error: p.error, projectTitle: p.project.title, username: p.socialAccount.username, thumbnailUrl: p.renderJob.thumbnailUrl }))}
        accounts={data.socialAccounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, displayName: a.displayName, avatarUrl: a.avatarUrl, expiresAt: a.tokenExpiresAt?.toISOString() ?? null }))}
        platforms={{ tiktok: integrations.tiktok(), youtube: integrations.youtube(), instagram: integrations.instagram() }}
        schedulingAllowed={plan.scheduling}
        maxAccounts={plan.maxSocialAccounts}
        flash={{ connected: params.connected, error: params.error }}
      />
    </div>
  );
}
