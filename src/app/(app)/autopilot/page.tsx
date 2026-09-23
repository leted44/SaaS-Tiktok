import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentWorkspace } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { AutopilotBoard, type AutopilotItemView } from "@/components/autopilot/autopilot-board";
import { effectivePlanDef, isAdmin, CREDIT_COSTS, renderCost, clampResolution } from "@/lib/plans";
import { ACTIVE_STATUSES, PRODUCTION_LEAD_MS } from "@/lib/autopilot/engine";
import { vapidKeys } from "@/lib/push";
import { integrations } from "@/lib/env";
import { parseJson } from "@/lib/validations";
import { socialCopySchema, fallbackSocialCopy, formatForPaste, platformHashtags } from "@/lib/social/captions";

export const metadata: Metadata = { title: "Pilote automatique" };
export const dynamic = "force-dynamic";

export default async function AutopilotPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const [params, user, workspace] = await Promise.all([searchParams, getCurrentUser(), getCurrentWorkspace()]);
  const plan = effectivePlanDef(user);

  const items = await prisma.autopilotItem.findMany({
    where: { userId: user.id },
    orderBy: { deliverAt: "asc" },
    take: 200,
    include: { project: { select: { id: true, title: true, activeScriptId: true, scripts: { orderBy: { version: "desc" }, take: 3, select: { id: true, hook: true, callToAction: true, hashtags: true, socialCopy: true } } } } },
  });
  const renderIds = items.map((i) => i.renderJobId).filter((id): id is string => Boolean(id));
  const thumbs = new Map((await prisma.renderJob.findMany({ where: { id: { in: renderIds } }, select: { id: true, thumbnailUrl: true } })).map((r) => [r.id, r.thumbnailUrl]));

  const views: AutopilotItemView[] = items.map((item) => {
    const script = item.project ? (item.project.scripts.find((s) => s.id === item.project!.activeScriptId) ?? item.project.scripts[0]) : null;
    const copy = script ? parseJson(socialCopySchema, script.socialCopy, fallbackSocialCopy({ hook: script.hook, callToAction: script.callToAction, hashtags: script.hashtags })) : null;
    return {
      id: item.id,
      topic: item.topic,
      tone: item.tone,
      targetDurationSec: item.targetDurationSec,
      deliverAt: item.deliverAt.toISOString(),
      status: item.status,
      failedStep: item.failedStep,
      error: item.error,
      attempts: item.attempts,
      videoUrl: item.videoUrl,
      thumbnailUrl: item.renderJobId ? (thumbs.get(item.renderJobId) ?? null) : null,
      projectId: item.project?.id ?? null,
      title: item.project?.title ?? null,
      caption: script && copy ? formatForPaste(copy.tiktok, platformHashtags(copy, "tiktok", script.hashtags)) : null,
    };
  });

  const resolution = clampResolution("1080p", plan.maxResolution);
  const free = isAdmin(user.role);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Pilote automatique"
        description="Programme un thème et une heure : l'IA écrit le script, génère la voix, choisit les visuels, monte la vidéo et te la livre à l'heure dite, prête à publier."
      />
      <AutopilotBoard
        items={views}
        highlight={params.item ?? null}
        quota={plan.autopilotQueue}
        queued={items.filter((i) => ACTIVE_STATUSES.includes(i.status)).length}
        leadHours={PRODUCTION_LEAD_MS / 3600_000}
        costs={free ? null : { script: CREDIT_COSTS.SCRIPT_GENERATION, render: renderCost(resolution), voicePer30s: CREDIT_COSTS.VOICEOVER_PER_30S }}
        credits={user.credits}
        pushKey={vapidKeys()?.publicKey ?? null}
        ready={{ ai: integrations.ai(), tts: integrations.tts(), stock: integrations.stock() }}
        defaults={{ language: workspace.defaultLanguage }}
      />
    </div>
  );
}
