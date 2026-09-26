import { prisma } from "@/lib/prisma";
import { RenderStatus } from "@prisma/client";

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

/** Claim the next queued clip job. Same conditional-update pattern as render jobs, so concurrent pollers never double-claim. */
export async function claimNextVideoClipJob(workerId: string) {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const candidate = await prisma.videoClipJob.findFirst({
    where: {
      OR: [{ status: RenderStatus.QUEUED }, { status: RenderStatus.PROCESSING, lockedAt: { lt: staleBefore } }],
      attempts: { lt: 3 },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, lockedAt: true, status: true },
  });
  if (!candidate) return null;

  const claimed = await prisma.videoClipJob.updateMany({
    where: { id: candidate.id, status: candidate.status, lockedAt: candidate.lockedAt },
    data: { status: RenderStatus.PROCESSING, lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  return prisma.videoClipJob.findUnique({ where: { id: candidate.id } });
}

/** Claim one specific job — what the studio's own polling advances, mirroring claimRenderJobById. */
export async function claimVideoClipJobById(jobId: string, workerId: string) {
  const candidate = await prisma.videoClipJob.findUnique({ where: { id: jobId }, select: { id: true, status: true, lockedAt: true, attempts: true, maxAttempts: true } });
  if (!candidate) return null;

  if (candidate.status === RenderStatus.QUEUED) {
    if (candidate.attempts >= candidate.maxAttempts) return null;
    const claimed = await prisma.videoClipJob.updateMany({
      where: { id: jobId, status: RenderStatus.QUEUED, lockedAt: candidate.lockedAt },
      data: { status: RenderStatus.PROCESSING, lockedAt: new Date(), lockedBy: workerId, startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return null;
  } else if (candidate.status !== RenderStatus.PROCESSING) {
    return null;
  }

  return prisma.videoClipJob.findUnique({ where: { id: jobId } });
}

export async function saveFalRequestId(jobId: string, falRequestId: string) {
  await prisma.videoClipJob.update({ where: { id: jobId }, data: { falRequestId, lockedAt: new Date() } });
}

export async function touchVideoClipJob(jobId: string) {
  await prisma.videoClipJob.update({ where: { id: jobId }, data: { lockedAt: new Date() } });
}

export async function completeVideoClipJob(jobId: string, resultUrl: string) {
  return prisma.videoClipJob.update({
    where: { id: jobId },
    data: { status: RenderStatus.COMPLETED, resultUrl, completedAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

export async function failVideoClipJob(jobId: string, error: string) {
  const job = await prisma.videoClipJob.findUniqueOrThrow({ where: { id: jobId } });
  const exhausted = job.attempts >= job.maxAttempts;
  const updated = await prisma.videoClipJob.update({
    where: { id: jobId },
    data: {
      status: exhausted ? RenderStatus.FAILED : RenderStatus.QUEUED,
      error: error.slice(0, 4000),
      lockedAt: null,
      lockedBy: null,
    },
  });
  return { job: updated, exhausted };
}
