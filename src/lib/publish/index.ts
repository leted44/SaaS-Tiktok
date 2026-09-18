import { PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/publish/oauth";
import { publishToInstagram, publishToTikTok, publishToYouTube, type PublishPayload } from "@/lib/publish/platforms";

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

/** Publish one job immediately (used by the worker and by "post now"). */
export async function executePublishJob(jobId: string): Promise<void> {
  const job = await prisma.publishJob.findUniqueOrThrow({ where: { id: jobId }, include: { renderJob: true, socialAccount: true, project: true } });
  if (!job.renderJob.outputUrl) throw new Error("Le rendu n'est pas encore disponible");

  const payload: PublishPayload = {
    videoUrl: job.renderJob.outputUrl,
    title: job.title ?? job.project.title,
    caption: job.caption,
    hashtags: job.hashtags,
    privacy: job.privacy as PublishPayload["privacy"],
  };

  const accessToken = await getValidAccessToken(job.socialAccountId);
  let result;
  switch (job.platform) {
    case "TIKTOK":
      result = await publishToTikTok(accessToken, payload);
      break;
    case "YOUTUBE":
      result = await publishToYouTube(accessToken, payload);
      break;
    case "INSTAGRAM":
      result = await publishToInstagram(accessToken, job.socialAccount.platformUserId, payload);
      break;
  }

  await prisma.publishJob.update({
    where: { id: jobId },
    data: { status: PublishStatus.PUBLISHED, publishedAt: new Date(), externalPostId: result.externalPostId, externalUrl: result.externalUrl, lockedAt: null, error: null },
  });
  await prisma.project.update({ where: { id: job.projectId }, data: { status: "PUBLISHED" } });
}

/** Process due scheduled posts. Safe to call concurrently from multiple workers. */
export async function processDuePublishJobs(limit = 5): Promise<number> {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const due = await prisma.publishJob.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      attempts: { lt: 3 },
      OR: [{ status: PublishStatus.SCHEDULED }, { status: PublishStatus.PUBLISHING, lockedAt: { lt: staleBefore } }],
      renderJob: { status: "COMPLETED" },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true, status: true, lockedAt: true },
  });

  let processed = 0;
  for (const candidate of due) {
    const claimed = await prisma.publishJob.updateMany({
      where: { id: candidate.id, status: candidate.status, lockedAt: candidate.lockedAt },
      data: { status: PublishStatus.PUBLISHING, lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      await executePublishJob(candidate.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const job = await prisma.publishJob.findUniqueOrThrow({ where: { id: candidate.id } });
      await prisma.publishJob.update({
        where: { id: candidate.id },
        data: { status: job.attempts >= 3 ? PublishStatus.FAILED : PublishStatus.SCHEDULED, error: message.slice(0, 2000), lockedAt: null },
      });
    }
    processed++;
  }
  return processed;
}
