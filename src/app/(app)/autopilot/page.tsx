import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { AutopilotBoard, type AutopilotItemView, type TemplateView } from "@/components/autopilot/autopilot-board";
import { effectivePlanDef, isAdmin } from "@/lib/plans";
import { ACTIVE_STATUSES, MAX_ATTEMPTS, PRODUCTION_LEAD_MS } from "@/lib/autopilot/engine";
import { templateToInput } from "@/lib/autopilot/templates";
import { appliedTemplateSchema } from "@/lib/autopilot/template-shared";
import { vapidKeys } from "@/lib/push";
import { integrations } from "@/lib/env";
import { parseJson } from "@/lib/validations";
import { socialCopySchema, fallbackSocialCopy, formatForPaste, platformHashtags } from "@/lib/social/captions";

export const metadata: Metadata = { title: "Pilote automatique" };
export const dynamic = "force-dynamic";

export default async function AutopilotPage({ searchParams }: { searchParams: Promise<{ item?: string; template?: string }> }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const plan = effectivePlanDef(user);
  const admin = isAdmin(user.role);

  const [templates, items, heartbeat, customVoice, recentProjects, spaces] = await Promise.all([
    prisma.videoTemplate.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    prisma.autopilotItem.findMany({
      where: { userId: user.id },
      orderBy: { deliverAt: "asc" },
      take: 200,
      include: {
        template: { select: { name: true } },
        space: { select: { name: true, color: true } },
        project: { select: { id: true, title: true, activeScriptId: true, scripts: { orderBy: { version: "desc" }, take: 3, select: { id: true, hook: true, callToAction: true, hashtags: true, socialCopy: true } } } },
      },
    }),
    prisma.workerHeartbeat.findUnique({ where: { id: "worker" } }),
    prisma.customVoice.findUnique({ where: { userId: user.id }, select: { name: true } }),
    prisma.project.findMany({ where: { userId: user.id, activeScriptId: { not: null } }, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, title: true } }),
    prisma.space.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, color: true, brief: true } }),
  ]);

  const renderIds = items.map((i) => i.renderJobId).filter((id): id is string => Boolean(id));
  const thumbs = new Map((await prisma.renderJob.findMany({ where: { id: { in: renderIds } }, select: { id: true, thumbnailUrl: true } })).map((r) => [r.id, r.thumbnailUrl]));

  // A template that no longer reads (saved under an older version of the rules) is left out rather than taking the page down.
  const templateViews: TemplateView[] = templates.flatMap((t) => {
    try {
      return [{
        id: t.id,
        name: t.name,
        isDefault: t.isDefault,
        input: templateToInput(t),
        queued: items.filter((i) => i.templateId === t.id && ACTIVE_STATUSES.includes(i.status)).length,
        waiting: items.filter((i) => i.templateId === t.id && i.status === "SCHEDULED").length,
      }];
    } catch (err) {
      console.error(`[autopilot] template ${t.id} unreadable:`, err);
      return [];
    }
  });

  const views: AutopilotItemView[] = items.map((item) => {
    const script = item.project ? (item.project.scripts.find((s) => s.id === item.project!.activeScriptId) ?? item.project.scripts[0]) : null;
    const copy = script ? parseJson(socialCopySchema, script.socialCopy, fallbackSocialCopy({ hook: script.hook, callToAction: script.callToAction, hashtags: script.hashtags })) : null;
    const applied = item.applied ? appliedTemplateSchema.safeParse(item.applied) : null;
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
      retryAt: item.retryAt?.toISOString() ?? null,
      videoUrl: item.videoUrl,
      thumbnailUrl: item.renderJobId ? (thumbs.get(item.renderJobId) ?? null) : null,
      projectId: item.project?.id ?? null,
      title: item.project?.title ?? null,
      caption: script && copy ? formatForPaste(copy.tiktok, platformHashtags(copy, "tiktok", script.hashtags)) : null,
      templateId: item.templateId,
      templateName: item.template?.name ?? null,
      applied: applied?.success ? applied.data : null,
      aiTopic: item.topicBrief !== null,
      space: item.space,
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Pilote automatique"
        description="Enregistre une fois tes réglages dans un modèle, puis programme tes thèmes : chaque vidéo est écrite, doublée, illustrée, montée et livrée à l'heure dite, exactement comme tu l'aurais faite dans le studio."
      />
      <AutopilotBoard
        templates={templateViews}
        items={views}
        highlightItem={params.item ?? null}
        highlightTemplate={params.template ?? null}
        quota={plan.autopilotQueue}
        queued={items.filter((i) => ACTIVE_STATUSES.includes(i.status)).length}
        leadHours={PRODUCTION_LEAD_MS / 3600_000}
        maxAttempts={MAX_ATTEMPTS}
        plan={{ maxResolution: plan.maxResolution, free: admin }}
        credits={user.credits}
        admin={admin}
        heartbeat={heartbeat ? { tickAt: heartbeat.tickAt.toISOString(), error: heartbeat.error } : null}
        customVoiceName={customVoice?.name ?? null}
        recentProjects={recentProjects}
        pushKey={vapidKeys()?.publicKey ?? null}
        ready={{ ai: integrations.ai(), tts: integrations.tts(), stock: integrations.stock() }}
        spaces={spaces}
      />
    </div>
  );
}
