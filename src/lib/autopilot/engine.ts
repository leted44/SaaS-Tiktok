import { AutopilotStatus, type AutopilotItem, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateScriptSchema, voiceoverRequestSchema } from "@/lib/validations";
import { InsufficientCreditsError } from "@/lib/credits";
import { effectivePlanDef } from "@/lib/plans";
import { createScript } from "@/lib/pipeline/script";
import { createVoiceover } from "@/lib/pipeline/voiceover";
import { fillProjectVisuals } from "@/lib/pipeline/visuals";
import { queueRender } from "@/lib/pipeline/render";
import { sendPush } from "@/lib/push";

/**
 * The autopilot: videos made and handed over on a schedule, with nobody at the
 * controls.
 *
 * Every worker tick (once a minute, from cron-job.org) moves each due item one
 * step: script → voice → visuals → render → ready → delivered. One step per
 * tick keeps every call short enough for a serverless function and lets a
 * crash resume exactly where it stopped. Production starts PRODUCTION_LEAD_MS
 * before the delivery time, so the video is normally ready — and reviewable in
 * the studio — well before it is due; an item scheduled closer than that
 * starts at once.
 *
 * Delivery today means a push notification with the video, ready to share.
 * Publishing straight to TikTok/Instagram slots in at that step once the
 * platform keys exist.
 */

export const PRODUCTION_LEAD_MS = 6 * 3600_000;
/**
 * `lockedAt` is a lease: a tick holds it while working on an item. A lease
 * older than this is treated as abandoned (the tick crashed or timed out).
 * After a failed attempt the lease is kept rather than cleared, so the item
 * rests for one full lease before it is tried again instead of failing again
 * a minute later.
 */
export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
/** Items started per tick, and the time after which a tick stops starting new ones. */
const MAX_ITEMS_PER_TICK = 3;
const TICK_BUDGET_MS = 120_000;

const IN_PRODUCTION: AutopilotStatus[] = ["SCRIPTING", "VOICING", "VISUALS", "RENDERING"];
export const ACTIVE_STATUSES: AutopilotStatus[] = ["SCHEDULED", ...IN_PRODUCTION, "READY"];

/** Items with work to do now, whose lease is free. */
export function dueWhere(now: Date): Prisma.AutopilotItemWhereInput {
  return {
    OR: [
      { status: "SCHEDULED", deliverAt: { lte: new Date(now.getTime() + PRODUCTION_LEAD_MS) } },
      { status: { in: IN_PRODUCTION } },
      { status: "READY", deliverAt: { lte: now } },
    ],
    AND: [{ OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }] }],
  };
}

type StepResult = { next: Partial<Prisma.AutopilotItemUncheckedUpdateInput> } | "wait";

export async function advanceAutopilot(now = new Date()): Promise<number> {
  const started = Date.now();
  const due = await prisma.autopilotItem.findMany({ where: dueWhere(now), orderBy: { deliverAt: "asc" }, take: MAX_ITEMS_PER_TICK, select: { id: true, status: true, lockedAt: true } });

  let advanced = 0;
  for (const candidate of due) {
    if (Date.now() - started > TICK_BUDGET_MS) break;
    // Claim atomically: another tick running in parallel sees the lease and skips it.
    const claimed = await prisma.autopilotItem.updateMany({
      where: { id: candidate.id, status: candidate.status, lockedAt: candidate.lockedAt },
      data: { lockedAt: new Date(), status: candidate.status === "SCHEDULED" ? "SCRIPTING" : candidate.status },
    });
    if (!claimed.count) continue;
    const item = await prisma.autopilotItem.findUniqueOrThrow({ where: { id: candidate.id } });
    await runStep(item);
    advanced++;
  }
  return advanced;
}

async function runStep(item: AutopilotItem): Promise<void> {
  // Every write is conditional on the item still being at the step this tick
  // claimed: if the user cancelled it meanwhile, the cancellation wins and the
  // step's result is dropped instead of bringing the item back to life.
  const stillHere = { id: item.id, status: item.status };
  try {
    const result = await step(item);
    if (result === "wait") {
      await prisma.autopilotItem.updateMany({ where: stillHere, data: { lockedAt: null } });
      return;
    }
    const { count } = await prisma.autopilotItem.updateMany({ where: stillHere, data: { ...result.next, attempts: 0, error: null, lockedAt: null } });
    if (count && result.next.status === "DELIVERED") await notifyDelivered(await prisma.autopilotItem.findUniqueOrThrow({ where: { id: item.id } }));
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    const attempts = item.attempts + 1;
    const final = attempts >= MAX_ATTEMPTS || isPermanent(err);
    const { count } = await prisma.autopilotItem.updateMany({
      where: stillHere,
      // A retry keeps the lease (see LEASE_MS); a final failure releases it.
      data: final ? { status: "FAILED", failedStep: item.status, attempts, error: message, lockedAt: null } : { attempts, error: message },
    });
    console.error(`[autopilot:${item.id}] ${item.status} failed (attempt ${attempts}):`, message);
    if (count && final) await notifyFailed({ ...item, error: message });
  }
}

/** Errors that another attempt cannot fix. */
function isPermanent(err: unknown): boolean {
  return err instanceof InsufficientCreditsError || err instanceof PermanentError;
}

export class PermanentError extends Error {}

async function step(item: AutopilotItem): Promise<StepResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: item.userId } });

  switch (item.status) {
    case "SCRIPTING": {
      if (effectivePlanDef(user).autopilotQueue === 0) throw new PermanentError("Le pilote automatique est réservé aux forfaits Pro et Agence.");
      const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: item.workspaceId } });
      const data = generateScriptSchema.parse({ topic: item.topic, tone: item.tone, targetDurationSec: item.targetDurationSec, language: item.language });
      const script = await createScript(user, workspace, data);
      return { next: { projectId: script.projectId, status: "VOICING" } };
    }

    case "VOICING": {
      const project = await requireProject(item);
      const scriptId = project.activeScriptId;
      if (!scriptId) throw new PermanentError("Le projet n'a plus de script.");
      const voiceId = project.voiceId ?? project.workspace.defaultVoiceId;
      await createVoiceover(user, voiceoverRequestSchema.parse({ projectId: project.id, scriptId, voiceId }));
      return { next: { status: "VISUALS" } };
    }

    case "VISUALS": {
      const project = await requireProject(item);
      const script = await prisma.script.findUniqueOrThrow({ where: { id: project.activeScriptId! } });
      const voiceover = await prisma.voiceover.findFirst({ where: { projectId: project.id, scriptId: script.id, status: "READY" }, orderBy: { createdAt: "desc" } });
      await fillProjectVisuals(project, script, voiceover);
      return { next: { status: "RENDERING" } };
    }

    case "RENDERING": {
      const project = await requireProject(item);
      if (!item.renderJobId) {
        const queued = await queueRender(user, project.id, "1080p");
        // The render itself runs in this same tick, right after the autopilot.
        return { next: { renderJobId: queued.renderJobId } };
      }
      const job = await prisma.renderJob.findUnique({ where: { id: item.renderJobId } });
      if (!job) throw new PermanentError("Le rendu a été supprimé.");
      if (job.status === "COMPLETED" && job.outputUrl) return { next: { status: "READY", videoUrl: job.outputUrl } };
      if (job.status === "FAILED" || job.status === "CANCELLED") throw new PermanentError(job.status === "FAILED" ? `Le rendu a échoué : ${job.error?.split("\n")[0] ?? "erreur inconnue"}` : "Le rendu a été annulé.");
      return "wait";
    }

    case "READY": {
      // The user may have edited and re-rendered the video in the studio since
      // it was made: what goes out is the latest finished render.
      const latest = item.projectId
        ? await prisma.renderJob.findFirst({ where: { projectId: item.projectId, status: "COMPLETED", outputUrl: { not: null } }, orderBy: { completedAt: "desc" } })
        : null;
      const videoUrl = latest?.outputUrl ?? item.videoUrl;
      if (!videoUrl) throw new PermanentError("La vidéo n'est plus disponible.");
      return { next: { status: "DELIVERED", videoUrl, deliveredAt: new Date() } };
    }

    default:
      return "wait";
  }
}

async function requireProject(item: AutopilotItem) {
  if (!item.projectId) throw new PermanentError("Le projet de cette vidéo a été supprimé.");
  const project = await prisma.project.findUnique({ where: { id: item.projectId }, include: { workspace: true } });
  if (!project) throw new PermanentError("Le projet de cette vidéo a été supprimé.");
  return project;
}

function shortTopic(topic: string): string {
  return topic.length > 60 ? `${topic.slice(0, 57).trimEnd()}…` : topic;
}

async function notifyDelivered(item: AutopilotItem) {
  await sendPush(item.userId, {
    title: "Ta vidéo est prête à publier",
    body: `« ${shortTopic(item.topic)} » — touche pour la partager.`,
    url: `/autopilot?item=${item.id}`,
    tag: `autopilot-${item.id}`,
  });
}

async function notifyFailed(item: AutopilotItem) {
  await sendPush(item.userId, {
    title: "Une vidéo programmée n'a pas pu être créée",
    body: `« ${shortTopic(item.topic)} » : ${item.error ?? "erreur inconnue"}`,
    url: `/autopilot?item=${item.id}`,
    tag: `autopilot-${item.id}`,
  });
}
