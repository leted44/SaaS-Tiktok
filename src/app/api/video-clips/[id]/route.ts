import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { advanceVideoClipJob } from "@/lib/video-clips/worker";

// Loads the fetch-based fal.ai client and, indirectly, storage — same reasoning as renders.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = {
  id: true,
  status: true,
  resultUrl: true,
  error: true,
  attempts: true,
  createdAt: true,
  completedAt: true,
} as const;

/**
 * Progress endpoint for the studio, polled every few seconds while a scene is
 * animating — and the thing that actually advances it, exactly like
 * /api/renders/[id] does for a Lambda render. The worker tick is the fallback
 * once the tab closes.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let job = await prisma.videoClipJob.findFirst({ where: { id, userId: session.user.id }, select: SELECT });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status === "QUEUED" || job.status === "PROCESSING") {
    try {
      await advanceVideoClipJob(id, `studio-${session.user.id.slice(-8)}`);
      job = (await prisma.videoClipJob.findFirst({ where: { id, userId: session.user.id }, select: SELECT })) ?? job;
    } catch (err) {
      // Never break the progress UI over this — the job records its own failures.
      console.error(`[video-clip:${id}] advance from studio poll failed:`, err);
    }
  }

  return NextResponse.json(job);
}
