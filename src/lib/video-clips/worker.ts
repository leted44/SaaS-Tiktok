import { prisma } from "@/lib/prisma";
import type { VideoClipJob } from "@prisma/client";
import { claimNextVideoClipJob, claimVideoClipJobById, completeVideoClipJob, failVideoClipJob, saveFalRequestId } from "@/lib/video-clips/queue";
import { submitImageToVideo, checkVideoStatus, VideoClipError, type VideoClipTier } from "@/lib/ai/video-clip-generator";
import { refundCredits } from "@/lib/credits";
import { putObject, storageKey } from "@/lib/storage";
import { parseJson, visualLayersSchema } from "@/lib/validations";

export type VideoClipOutcome = { jobId: string; status: "completed" | "failed" | "requeued" | "in_progress" };

/** Process one clip job if available. Called by the standalone worker loop and by the jobs/process endpoint. */
export async function processOneVideoClipJob(workerId: string): Promise<VideoClipOutcome | null> {
  const job = await claimNextVideoClipJob(workerId);
  if (!job) return null;
  return runVideoClipJob(job);
}

/** Move one specific job forward — what the studio's own progress polling calls. */
export async function advanceVideoClipJob(jobId: string, workerId: string): Promise<VideoClipOutcome | null> {
  const job = await claimVideoClipJobById(jobId, workerId);
  if (!job) return null;
  return runVideoClipJob(job);
}

/**
 * Download the finished clip and swap it into the layer it was made for.
 *
 * The layer might have been edited, moved, or deleted entirely while the clip
 * was generating (this can take minutes) — if it's gone, the clip has nowhere
 * to go, so it's stored as a plain finished job and nothing on the project
 * changes; the credits already spent stay spent, same as a render whose
 * project was deleted mid-render.
 */
async function applyResultToLayer(projectId: string, layerId: string, videoUrl: string, userId: string): Promise<string | null> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { visualLayers: true } });
  const layers = parseJson(visualLayersSchema, project.visualLayers, []);
  const target = layers.find((l) => l.id === layerId);
  if (!target) return null;

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Le téléchargement du clip généré a échoué (${videoRes.status}).`);
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  const stored = await putObject(storageKey(userId, "asset", `${layerId}-kling.mp4`), buffer, "video/mp4");

  const next = layers.map((l) => (l.id === layerId ? { ...l, type: "video" as const, src: stored.url } : l));
  await prisma.project.update({ where: { id: projectId }, data: { visualLayers: next } });
  return stored.url;
}

async function runVideoClipJob(job: VideoClipJob): Promise<VideoClipOutcome> {
  const tier = job.tier as VideoClipTier;
  try {
    if (!job.falRequestId) {
      const { requestId } = await submitImageToVideo(job.imageUrl, job.prompt, tier);
      await saveFalRequestId(job.id, requestId);
      return { jobId: job.id, status: "in_progress" };
    }

    const status = await checkVideoStatus(job.falRequestId, tier);
    if (status.state === "pending") return { jobId: job.id, status: "in_progress" };
    if (status.state === "failed") throw new Error(status.message);

    // The layer's own src is the durable, re-hosted copy; a raw provider URL is
    // kept only as a fallback record when the layer was deleted mid-generation
    // and there was nothing left to apply it to.
    const storedUrl = await applyResultToLayer(job.projectId, job.layerId, status.videoUrl, job.userId);
    await completeVideoClipJob(job.id, storedUrl ?? status.videoUrl);
    return { jobId: job.id, status: "completed" };
  } catch (err) {
    const message = err instanceof VideoClipError ? err.message : err instanceof Error ? err.message : String(err);
    console.error(`[video-clip:${job.id}] failed on attempt ${job.attempts}:`, message);
    const { exhausted } = await failVideoClipJob(job.id, message);
    if (exhausted && job.creditsCharged > 0) {
      await refundCredits(job.userId, job.creditsCharged, "Remboursement — l'animation de la scène a échoué", job.id);
    }
    return { jobId: job.id, status: exhausted ? "failed" : "requeued" };
  }
}
