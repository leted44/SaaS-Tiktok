import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { RENDER_STEPS } from "@/lib/render/queue";
import { advanceRenderJob } from "@/lib/render/worker";

// Pinned because advancing a render loads the AWS SDK, which is Node-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = {
  id: true,
  status: true,
  progress: true,
  step: true,
  outputUrl: true,
  thumbnailUrl: true,
  error: true,
  durationMs: true,
  sizeBytes: true,
  attempts: true,
  createdAt: true,
  completedAt: true,
} as const;

/**
 * Progress endpoint for the studio, polled every few seconds while a render is
 * running — and, on the Lambda engine, the thing that actually drives that
 * render forward. Starting and finishing used to wait on the external cron's
 * next tick, costing up to a minute of dead time at each step for work that
 * was already done. The cron stays as the fallback for a closed tab.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let job = await prisma.renderJob.findFirst({ where: { id, userId: session.user.id }, select: SELECT });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the Lambda engine can be stepped without blocking: the local engine
  // renders inline and would hold this request open for the whole video.
  const active = job.status === "QUEUED" || job.status === "PROCESSING";
  if (active && env.renderEngine === "lambda") {
    try {
      // A zero budget means one progress check, so the response stays quick.
      await advanceRenderJob(id, `studio-${session.user.id.slice(-8)}`, { pollBudgetMs: 0 });
      job = (await prisma.renderJob.findFirst({ where: { id, userId: session.user.id }, select: SELECT })) ?? job;
    } catch (err) {
      // Never break the progress UI over this — the job records its own
      // failures, and the cron will retry regardless.
      console.error(`[render:${id}] advance from studio poll failed:`, err);
    }
  }

  const stepLabel = RENDER_STEPS.find((s) => s.key === job.step)?.label ?? job.step;
  return NextResponse.json({ ...job, stepLabel });
}
