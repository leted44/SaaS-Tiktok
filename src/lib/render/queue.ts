import { prisma } from "@/lib/prisma";
import { RenderStatus, PublishStatus } from "@prisma/client";

export const RENDER_STEPS = [
  { key: "queued", label: "Waiting in queue", progress: 0 },
  { key: "preparing", label: "Preparing assets", progress: 8 },
  { key: "bundling", label: "Bundling composition", progress: 18 },
  { key: "rendering", label: "Rendering frames", progress: 25 },
  { key: "encoding", label: "Encoding MP4", progress: 88 },
  { key: "uploading", label: "Uploading", progress: 95 },
  { key: "done", label: "Completed", progress: 100 },
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
    data: { status: RenderStatus.PROCESSING, lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 }, step: "preparing", progress: 8, error: null },
  });
  if (claimed.count === 0) return null;
  return prisma.renderJob.findUnique({ where: { id: candidate.id }, include: { project: { include: { workspace: true } }, user: true } });
}

export async function updateRenderProgress(jobId: string, step: RenderStepKey, progress?: number) {
  const def = RENDER_STEPS.find((s) => s.key === step);
  await prisma.renderJob.update({
    where: { id: jobId },
    data: { step, progress: Math.min(99, Math.max(0, Math.round(progress ?? def?.progress ?? 0))), lockedAt: new Date() },
  });
}

export async function completeRenderJob(jobId: string, result: { outputUrl: string; thumbnailUrl: string | null; sizeBytes: number; durationMs: number }) {
  const job = await prisma.renderJob.update({
    where: { id: jobId },
    data: { status: RenderStatus.COMPLETED, progress: 100, step: "done", completedAt: new Date(), lockedAt: null, lockedBy: null, ...result },
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
    },
  });
  if (exhausted) {
    await prisma.project.update({ where: { id: job.projectId }, data: { status: "FAILED" } });
    await prisma.publishJob.updateMany({ where: { renderJobId: jobId, status: PublishStatus.SCHEDULED }, data: { status: PublishStatus.FAILED, error: "Render failed" } });
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
