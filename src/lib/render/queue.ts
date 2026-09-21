import { prisma } from "@/lib/prisma";
import { Prisma, RenderStatus, PublishStatus } from "@prisma/client";

export const RENDER_STEPS = [
  { key: "queued", label: "En attente dans la file", progress: 0 },
  { key: "preparing", label: "Préparation des ressources", progress: 8 },
  { key: "bundling", label: "Compilation de la composition", progress: 18 },
  { key: "rendering", label: "Rendu des images", progress: 25 },
  { key: "encoding", label: "Encodage MP4", progress: 88 },
  { key: "uploading", label: "Téléversement", progress: 95 },
  { key: "done", label: "Terminé", progress: 100 },
] as const;
export type RenderStepKey = (typeof RENDER_STEPS)[number]["key"];

const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Claim the next queued render job. Uses a single conditional update so multiple
 * workers can poll safely; stale locks (crashed workers) are reclaimed.
 */
export async function claimNextRenderJob(workerId: string) {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const candidate = await prisma.renderJob.findFirst({
    where: {
      OR: [
        { status: RenderStatus.QUEUED },
        { status: RenderStatus.PROCESSING, lockedAt: { lt: staleBefore } },
      ],
      attempts: { lt: 3 },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: { id: true, lockedAt: true, status: true },
  });
  if (!candidate) return null;

  const claimed = await prisma.renderJob.updateMany({
    where: { id: candidate.id, status: candidate.status, lockedAt: candidate.lockedAt },
    data: { status: RenderStatus.PROCESSING, lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 }, step: "preparing", progress: 8, error: null, logs: Prisma.DbNull },
  });
  if (claimed.count === 0) return null;
  return prisma.renderJob.findUnique({ where: { id: candidate.id }, include: { project: { include: { workspace: true } }, user: true } });
}

/**
 * Claim one specific job — the one a studio tab is watching — rather than
 * whatever is next in the queue. Returns null when there is nothing to do on
 * it, including when another caller is mid-start (PROCESSING but no engine
 * state saved yet), which is what keeps two concurrent pollers from launching
 * the same render twice.
 */
export async function claimRenderJobById(jobId: string, workerId: string) {
  const candidate = await prisma.renderJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, lockedAt: true, logs: true, attempts: true, maxAttempts: true },
  });
  if (!candidate) return null;

  if (candidate.status === RenderStatus.QUEUED) {
    if (candidate.attempts >= candidate.maxAttempts) return null;
    const claimed = await prisma.renderJob.updateMany({
      where: { id: jobId, status: RenderStatus.QUEUED, lockedAt: candidate.lockedAt },
      data: { status: RenderStatus.PROCESSING, lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 }, step: "preparing", progress: 8, error: null, logs: Prisma.DbNull },
    });
    if (claimed.count === 0) return null;
  } else if (candidate.status !== RenderStatus.PROCESSING || candidate.logs === null) {
    return null;
  }

  return prisma.renderJob.findUnique({ where: { id: jobId }, include: { project: { include: { workspace: true } }, user: true } });
}

export async function updateRenderProgress(jobId: string, step: RenderStepKey, progress?: number) {
  const def = RENDER_STEPS.find((s) => s.key === step);
  await prisma.renderJob.update({
    where: { id: jobId },
    data: { step, progress: Math.min(99, Math.max(0, Math.round(progress ?? def?.progress ?? 0))), lockedAt: new Date() },
  });
}

export async function completeRenderJob(jobId: string, result: { outputUrl: string; thumbnailUrl: string | null; sizeBytes: number; durationMs: number; timings?: unknown }) {
  const { timings, ...stored } = result;
  const job = await prisma.renderJob.update({
    where: { id: jobId },
    data: {
      status: RenderStatus.COMPLETED,
      progress: 100,
      step: "done",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      // Replaces the engine state the job no longer needs: a finished job is
      // never resumed, and this is what makes a slow render diagnosable
      // without digging through CloudWatch.
      logs: timings ? (timings as Prisma.InputJsonValue) : Prisma.DbNull,
      ...stored,
    },
  });
  await prisma.project.update({ where: { id: job.projectId }, data: { status: "RENDERED", thumbnailUrl: result.thumbnailUrl ?? undefined } });
  return job;
}

export async function failRenderJob(jobId: string, error: string) {
  const job = await prisma.renderJob.findUniqueOrThrow({ where: { id: jobId } });
  const exhausted = job.attempts >= job.maxAttempts;
  const updated = await prisma.renderJob.update({
    where: { id: jobId },
    data: {
      status: exhausted ? RenderStatus.FAILED : RenderStatus.QUEUED,
      step: exhausted ? "failed" : "queued",
      progress: 0,
      error: error.slice(0, 4000),
      lockedAt: null,
      lockedBy: null,
      logs: Prisma.DbNull,
    },
  });
  if (exhausted) {
    await prisma.project.update({ where: { id: job.projectId }, data: { status: "FAILED" } });
    await prisma.publishJob.updateMany({ where: { renderJobId: jobId, status: PublishStatus.SCHEDULED }, data: { status: PublishStatus.FAILED, error: "Le rendu a échoué" } });
  }
  return { job: updated, exhausted };
}

export async function queueStats() {
  const [queued, processing] = await Promise.all([
    prisma.renderJob.count({ where: { status: RenderStatus.QUEUED } }),
    prisma.renderJob.count({ where: { status: RenderStatus.PROCESSING } }),
  ]);
  return { queued, processing };
}
