import type { AutopilotItem, AutopilotStatus, Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateScriptSchema, voiceoverRequestSchema } from "@/lib/validations";
import { InsufficientCreditsError } from "@/lib/credits";
import { effectivePlanDef } from "@/lib/plans";
import { ScriptGenerationError } from "@/lib/ai/script-generator";
import { inventTopic } from "@/lib/ai/topic-generator";
import { TTSError } from "@/lib/tts";
import { VoiceUnavailableError } from "@/lib/tts/resolve-voice";
import { createScript } from "@/lib/pipeline/script";
import { createVoiceover } from "@/lib/pipeline/voiceover";
import { fillProjectVisuals } from "@/lib/pipeline/visuals";
import { queueRender } from "@/lib/pipeline/render";
import { applyTemplateToProject, TemplateError, templateToInput } from "@/lib/autopilot/templates";
import { appliedTemplateSchema, type AppliedTemplate } from "@/lib/autopilot/template-shared";
import { sendPush } from "@/lib/push";

/**
 * The autopilot: videos made and handed over on a schedule, with nobody at the
 * controls.
 *
 * It replays, in order, the steps a user takes in the studio — write the
 * script, voice it, dress each scene, render — using a saved template for every
 * choice the studio would ask for. Every worker tick (once a minute) moves each
 * due item one step, so every call stays short and a crash resumes exactly
 * where it stopped. Each step is safe to run twice: the project is created
 * once, an existing voice-over or render is reused rather than paid for again.
 *
 * Production starts PRODUCTION_LEAD_MS before the delivery time (at once when
 * closer), so the video is normally ready — and reviewable in the studio — well
 * before it is due. Delivery today is a push notification with the video ready
 * to share; direct publishing to TikTok/Instagram slots in at that step once
 * the platform keys exist.
 */

export const PRODUCTION_LEAD_MS = 6 * 3600_000;
/** A claim older than this is treated as abandoned (the tick crashed or was cut off). */
export const LEASE_MS = 10 * 60_000;
/** Wait before the 2nd and 3rd attempt of a failed step. */
export const RETRY_DELAYS_MS = [60_000, 3 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Items started per tick, and the time after which a tick stops starting new ones. */
const MAX_ITEMS_PER_TICK = 3;
const TICK_BUDGET_MS = 120_000;

const IN_PRODUCTION: AutopilotStatus[] = ["SCRIPTING", "VOICING", "VISUALS", "RENDERING"];
export const ACTIVE_STATUSES: AutopilotStatus[] = ["SCHEDULED", ...IN_PRODUCTION, "READY"];

/** Items with work to do now: in their window, not claimed by another tick, not resting after a failure. */
export function dueWhere(now: Date): Prisma.AutopilotItemWhereInput {
  return {
    OR: [
      { status: "SCHEDULED", deliverAt: { lte: new Date(now.getTime() + PRODUCTION_LEAD_MS) } },
      { status: { in: IN_PRODUCTION } },
      { status: "READY", deliverAt: { lte: now } },
    ],
    AND: [
      { OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }] },
      { OR: [{ retryAt: null }, { retryAt: { lte: now } }] },
    ],
  };
}

type StepResult = { next: Partial<Prisma.AutopilotItemUncheckedUpdateInput> } | "wait";

export async function advanceAutopilot(now = new Date()): Promise<number> {
  const started = Date.now();
  const due = await prisma.autopilotItem.findMany({ where: dueWhere(now), orderBy: { deliverAt: "asc" }, take: MAX_ITEMS_PER_TICK, select: { id: true, status: true, lockedAt: true } });

  let advanced = 0;
  for (const candidate of due) {
    if (Date.now() - started > TICK_BUDGET_MS) break;
    // Claim atomically: a tick running in parallel sees the claim and skips the item.
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
    const { count } = await prisma.autopilotItem.updateMany({ where: stillHere, data: { ...result.next, attempts: 0, error: null, retryAt: null, lockedAt: null } });
    if (count && result.next.status === "DELIVERED") await notifyDelivered(await prisma.autopilotItem.findUniqueOrThrow({ where: { id: item.id } }));
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    const attempts = item.attempts + 1;
    const final = attempts >= MAX_ATTEMPTS || isPermanent(err);
    const { count } = await prisma.autopilotItem.updateMany({
      where: stillHere,
      data: final
        ? { status: "FAILED", failedStep: item.status, attempts, error: message, lockedAt: null, retryAt: null }
        : { attempts, error: message, lockedAt: null, retryAt: new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]) },
    });
    console.error(`[autopilot:${item.id}] ${item.status} failed (attempt ${attempts}${final ? ", final" : ""}):`, message);
    if (count && final) await notifyFailed({ ...item, error: message });
  }
}

export class PermanentError extends Error {}

/** HTTP status quoted in an upstream error message, if any. */
function quotedStatus(message: string): number | null {
  const m = /\b(4\d\d|5\d\d)\b/.exec(message);
  return m ? Number(m[1]) : null;
}

/**
 * Errors another attempt cannot fix: missing keys, exhausted quotas, refused
 * content, invalid requests. Retrying those only delays the message the user
 * needs to see. Rate limits, timeouts and server errors are worth retrying.
 */
export function isPermanent(err: unknown): boolean {
  if (err instanceof InsufficientCreditsError || err instanceof PermanentError || err instanceof TemplateError || err instanceof VoiceUnavailableError) return true;
  if (err instanceof ScriptGenerationError) {
    if (err.code === "NOT_CONFIGURED" || err.code === "REFUSED") return true;
    const status = quotedStatus(err.message);
    return status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
  if (err instanceof TTSError) {
    if (err.code === "NOT_CONFIGURED" || err.code === "QUOTA") return true;
    const status = quotedStatus(err.message);
    return status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
  return false;
}

/**
 * The settings this production uses. Frozen on the item when production
 * starts, so editing or deleting the template afterwards never changes a video
 * already being made.
 */
async function appliedFor(item: AutopilotItem): Promise<AppliedTemplate> {
  const frozen = item.applied ? appliedTemplateSchema.safeParse(item.applied) : null;
  if (frozen?.success) return frozen.data;
  const template =
    (item.templateId ? await prisma.videoTemplate.findFirst({ where: { id: item.templateId, userId: item.userId } }) : null) ??
    (await prisma.videoTemplate.findFirst({ where: { userId: item.userId, isDefault: true } })) ??
    (await prisma.videoTemplate.findFirst({ where: { userId: item.userId }, orderBy: { createdAt: "asc" } }));
  if (!template) throw new PermanentError("Aucun modèle de vidéo : crée un modèle dans Pilote automatique, puis relance cette vidéo.");
  try {
    return { ...templateToInput(template), templateId: template.id };
  } catch {
    throw new PermanentError(`Le modèle « ${template.name} » n'est plus lisible : crée un nouveau modèle, puis relance cette vidéo.`);
  }
}

/**
 * The settings for the step about to run. The first step that needs them
 * freezes them on the item. An item that already has a project by then (one
 * scheduled before templates existed, relaunched mid-way) also gets the
 * template's look on that project, so the rest of the video follows the
 * template rather than the old defaults.
 */
async function ensureApplied(item: AutopilotItem): Promise<AppliedTemplate> {
  const applied = await appliedFor(item);
  if (!item.applied) {
    await prisma.autopilotItem.updateMany({ where: { id: item.id, status: item.status }, data: { applied } });
    if (item.projectId) await applyTemplateToProject(item.projectId, { ...applied, targetDurationSec: item.targetDurationSec });
  }
  return applied;
}

function titleFromTopic(topic: string): string {
  const oneLine = topic.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77).trimEnd()}…` : oneLine;
}

async function step(item: AutopilotItem): Promise<StepResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: item.userId } });

  switch (item.status) {
    case "SCRIPTING":
      return scriptStep(item, user);

    case "VOICING": {
      const applied = await ensureApplied(item);
      const project = await requireProject(item);
      const scriptId = project.activeScriptId;
      if (!scriptId) throw new PermanentError("Le projet n'a plus de script.");
      // Already voiced (a previous attempt finished but was cut off before recording it): don't pay twice.
      const existing = await prisma.voiceover.findFirst({ where: { projectId: project.id, scriptId, status: "READY" } });
      if (!existing) {
        const voiceId = project.voiceId ?? applied.voiceId;
        await createVoiceover(user, voiceoverRequestSchema.parse({ projectId: project.id, scriptId, voiceId, stability: applied.voiceStability, speed: applied.voiceSpeed }));
      }
      return { next: { status: "VISUALS" } };
    }

    case "VISUALS": {
      const applied = await ensureApplied(item);
      const project = await requireProject(item);
      if (applied.stockVisuals) {
        const script = await prisma.script.findUniqueOrThrow({ where: { id: project.activeScriptId! } });
        const voiceover = await prisma.voiceover.findFirst({ where: { projectId: project.id, scriptId: script.id, status: "READY" }, orderBy: { createdAt: "desc" } });
        await fillProjectVisuals(project, script, voiceover);
      }
      return { next: { status: "RENDERING" } };
    }

    case "RENDERING": {
      const project = await requireProject(item);
      if (!item.renderJobId) {
        // A render already under way or done for this project (an earlier attempt, or one started from the studio) is adopted.
        const existing = await prisma.renderJob.findFirst({ where: { projectId: project.id, status: { in: ["QUEUED", "PROCESSING", "COMPLETED"] } }, orderBy: { createdAt: "desc" } });
        if (existing) return { next: { renderJobId: existing.id } };
        const applied = await ensureApplied(item);
        const queued = await queueRender(user, project.id, applied.resolution);
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

/**
 * Step 1 — the project and its script, as "Générer" does in the studio, then
 * the template's look applied as the studio's panels would. The project is
 * created and recorded before the script is paid for, so an attempt cut off
 * halfway resumes on the same project instead of starting a duplicate.
 */
async function scriptStep(item: AutopilotItem, user: User): Promise<StepResult> {
  if (effectivePlanDef(user).autopilotQueue === 0) throw new PermanentError("Le pilote automatique est réservé aux forfaits Pro et Agence.");
  const stillHere = { id: item.id, status: item.status };

  const applied = await ensureApplied(item);

  // Topic left to the AI: picked now rather than at scheduling, so it can avoid
  // every video made in the meantime. Saved before anything else happens, so a
  // retry keeps the same topic instead of inventing another.
  let topic = item.topic.trim();
  if (!topic && item.topicBrief) {
    topic = await inventTopic({ brief: item.topicBrief, language: applied.language, tone: item.tone, covered: await coveredTopics(item) });
    const { count } = await prisma.autopilotItem.updateMany({ where: stillHere, data: { topic } });
    if (!count) return "wait";
  }
  if (!topic) throw new PermanentError("Cette vidéo n'a pas de thème : annule-la et programme-la à nouveau.");

  let projectId = item.projectId;
  if (!projectId) {
    const project = await prisma.project.create({
      data: { userId: user.id, workspaceId: item.workspaceId, spaceId: item.spaceId, title: titleFromTopic(topic), topic, language: applied.language, targetDurationSec: item.targetDurationSec, aspectRatio: applied.aspectRatio },
    });
    projectId = project.id;
    const { count } = await prisma.autopilotItem.updateMany({ where: stillHere, data: { projectId } });
    if (!count) return "wait"; // cancelled meanwhile: leave the empty project, spend nothing
  }
  // The duration chosen when scheduling overrides the template's.
  await applyTemplateToProject(projectId, { ...applied, targetDurationSec: item.targetDurationSec });

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.activeScriptId) {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: item.workspaceId } });
    const data = generateScriptSchema.parse({ projectId, topic, tone: item.tone, targetDurationSec: item.targetDurationSec, language: applied.language });
    const summary = await createScript(user, workspace, data);
    const script = await prisma.script.findUniqueOrThrow({ where: { id: summary.scriptId }, select: { title: true } });
    // The studio names a project after its script; do the same.
    await prisma.project.update({ where: { id: projectId }, data: { title: script.title } });
  }
  return { next: { projectId, status: "VOICING" } };
}

/**
 * What this theme has already covered, most recent first: the videos of the
 * same space, and the other autopilot videos invented from the same theme
 * (a series scheduled without a space has only those).
 */
async function coveredTopics(item: AutopilotItem): Promise<string[]> {
  const [projects, siblings] = await Promise.all([
    item.spaceId
      ? prisma.project.findMany({ where: { userId: item.userId, spaceId: item.spaceId }, orderBy: { createdAt: "desc" }, take: 40, select: { title: true, topic: true } })
      : Promise.resolve([]),
    prisma.autopilotItem.findMany({
      where: { userId: item.userId, id: { not: item.id }, topic: { not: "" }, topicBrief: item.topicBrief },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { topic: true, project: { select: { title: true } } },
    }),
  ]);
  const all = [...projects.flatMap((p) => [p.topic ?? "", p.title]), ...siblings.flatMap((s) => [s.topic, s.project?.title ?? ""])];
  return [...new Set(all.map((t) => t.trim()).filter(Boolean))];
}

async function requireProject(item: AutopilotItem) {
  if (!item.projectId) throw new PermanentError("Le projet de cette vidéo a été supprimé.");
  const project = await prisma.project.findUnique({ where: { id: item.projectId }, include: { workspace: true } });
  if (!project) throw new PermanentError("Le projet de cette vidéo a été supprimé.");
  return project;
}

function shortTopic(topic: string): string {
  if (!topic.trim()) return "Sujet choisi par l'IA";
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
