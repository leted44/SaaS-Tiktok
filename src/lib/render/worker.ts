import { Prisma, type RenderJob, type Project, type Workspace, type User } from "@prisma/client";
import { claimNextRenderJob, claimRenderJobById, completeRenderJob, failRenderJob } from "@/lib/render/queue";
import { getRenderEngine, type RenderOptions } from "@/lib/render/engine";
import { shortVideoPropsSchema } from "@/lib/render/props";
import { refundCredits } from "@/lib/credits";
import { processDuePublishJobs } from "@/lib/publish";
import { advanceAutopilot } from "@/lib/autopilot/engine";
import { prisma } from "@/lib/prisma";

/**
 * Process one render job if available. Returns the job id or null when idle.
 * Called by the standalone worker loop and by the /api/jobs/process endpoint.
 *
 * A job already PROCESSING with saved engine state (e.g. a Lambda renderId) is
 * resumed before claiming a new one, so each tick only checks its progress
 * instead of restarting the render from scratch.
 */
type RenderJobWithRelations = RenderJob & { project: Project & { workspace: Workspace }; user: User };
export type RenderJobOutcome = { jobId: string; status: "completed" | "failed" | "requeued" | "in_progress" };

export async function processOneRenderJob(workerId: string, opts?: RenderOptions): Promise<RenderJobOutcome | null> {
  const resumable = await prisma.renderJob.findFirst({
    where: { status: "PROCESSING", logs: { not: Prisma.DbNull } },
    orderBy: { updatedAt: "asc" },
    include: { project: { include: { workspace: true } }, user: true },
  });
  const job = resumable ?? (await claimNextRenderJob(workerId));
  if (!job) return null;
  return runRenderJob(job, opts);
}

/**
 * Move one specific job forward. Lets the studio's own progress polling drive
 * a render — start it, advance it, finish it — instead of every step waiting on
 * the external cron's next tick, which costs up to a minute of dead time each.
 */
export async function advanceRenderJob(jobId: string, workerId: string, opts?: RenderOptions): Promise<RenderJobOutcome | null> {
  const job = await claimRenderJobById(jobId, workerId);
  if (!job) return null;
  return runRenderJob(job, opts);
}

async function runRenderJob(job: RenderJobWithRelations, opts?: RenderOptions): Promise<RenderJobOutcome> {
  const engine = getRenderEngine();
  try {
    const props = shortVideoPropsSchema.parse(job.inputProps);
    const output = await engine.render(job, props, opts);
    if (!output) return { jobId: job.id, status: "in_progress" };
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
  // Autopilot first: a render it queues this tick is then picked up just below.
  // Isolated so a problem there never holds up renders and posts people started by hand.
  const autopilot = await advanceAutopilot().catch((err) => {
    console.error("[autopilot] tick failed:", err);
    return 0;
  });
  const render = await processOneRenderJob(workerId);
  const published = await processDuePublishJobs(5);
  return { autopilot, render, published };
}
