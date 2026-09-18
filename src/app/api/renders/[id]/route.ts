import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RENDER_STEPS } from "@/lib/render/queue";

export const dynamic = "force-dynamic";

/** Lightweight polling endpoint used by the studio progress UI. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const job = await prisma.renderJob.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, status: true, progress: true, step: true, outputUrl: true, thumbnailUrl: true, error: true, durationMs: true, sizeBytes: true, attempts: true, createdAt: true, completedAt: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stepLabel = RENDER_STEPS.find((s) => s.key === job.step)?.label ?? job.step;
  return NextResponse.json({ ...job, stepLabel });
}
