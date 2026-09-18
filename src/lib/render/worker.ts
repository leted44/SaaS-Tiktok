import { claimNextRenderJob, completeRenderJob, failRenderJob } from "@/lib/render/queue";
import { getRenderEngine } from "@/lib/render/engine";
import { shortVideoPropsSchema } from "@/lib/render/props";
import { refundCredits } from "@/lib/credits";
import { processDuePublishJobs } from "@/lib/publish";
import { prisma } from "@/lib/prisma";

/**
 * Process one render job if available. Returns the job id or null when idle.
 * Called by the standalone worker loop and by the /api/jobs/process endpoint.
 */
export async function processOneRenderJob(workerId: string): Promise<{ jobId: string; status: "completed" | "failed" | "requeued" } | null> {
  const job = await claimNextRenderJob(workerId);
  if (!job) return null;

  const engine = getRenderEngine();
  try {
    const props = shortVideoPropsSchema.parse(job.inputProps);
    const output = await engine.render(job, props);
    await completeRenderJob(job.id, output);
    return { jobId: job.id, status: "completed" };
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    console.error(`[render:${job.id}] failed on attempt ${job.attempts}:`, message);
    const { exhausted } = await failRenderJob(job.id, message);
    if (exhausted && job.creditsCharged > 0) {
      await refundCredits(job.userId, job.creditsCharged, "Refund — render failed", job.id);
      await prisma.renderJob.update({ where: { id: job.id }, data: { creditsCharged: 0 } });
    }
    return { jobId: job.id, status: exhausted ? "failed" : "requeued" };
  }
}

export async function runWorkerTick(workerId: string) {
  const render = await processOneRenderJob(workerId);
  const published = await processDuePublishJobs(5);
  return { render, published };
}
