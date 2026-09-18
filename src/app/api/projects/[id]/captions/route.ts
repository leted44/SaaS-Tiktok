import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toSrt } from "@/lib/captions/align";
import { parseJson, wordTimingSchema } from "@/lib/validations";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Download the latest voiceover's captions as SRT. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id, userId: session.user.id }, select: { title: true, activeScriptId: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const voiceover = await prisma.voiceover.findFirst({ where: { projectId: id, status: "READY", ...(project.activeScriptId ? { scriptId: project.activeScriptId } : {}) }, orderBy: { createdAt: "desc" } });
  if (!voiceover) return NextResponse.json({ error: "Generate a voiceover first" }, { status: 404 });
  const words = parseJson(z.array(wordTimingSchema), voiceover.wordTimings, []);
  return new NextResponse(toSrt(words), {
    headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${project.title.replace(/[^a-z0-9]+/gi, "-")}.srt"` },
  });
}
