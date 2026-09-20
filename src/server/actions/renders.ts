"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { renderRequestSchema } from "@/lib/validations";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, effectivePlanDef, clampResolution, renderCost } from "@/lib/plans";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { env } from "@/lib/env";
import { guard, type ActionResult } from "@/server/action-result";

export async function enqueueRender(input: unknown): Promise<ActionResult<{ renderJobId: string; creditsCharged: number; resolution: string }>> {
  return guard(async () => {
    const sessionUser = await requireUser();
    const data = renderRequestSchema.parse(input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    const project = await prisma.project.findFirstOrThrow({ where: { id: data.projectId, userId: user.id }, include: { workspace: true } });
    const script = project.activeScriptId
      ? await prisma.script.findUnique({ where: { id: project.activeScriptId } })
      : await prisma.script.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" } });
    if (!script) throw new Error("Générez un script avant de lancer le rendu.");
    const voiceover = await prisma.voiceover.findFirst({ where: { projectId: project.id, scriptId: script.id, status: "READY" }, orderBy: { createdAt: "desc" } });

    const active = await prisma.renderJob.count({ where: { projectId: project.id, status: { in: ["QUEUED", "PROCESSING"] } } });
    if (active > 0) throw new Error("Un rendu est déjà en cours pour ce projet.");

    const planDef = effectivePlanDef(user);
    const resolution = clampResolution(data.resolution, planDef.maxResolution);
    const cost = isAdmin(user.role) ? 0 : renderCost(resolution);
    if (cost > 0) await chargeCredits(user.id, cost, "RENDER", `Rendu ${resolution} — ${project.title}`, project.id);

    try {
      const props = buildShortVideoProps({ project, script, voiceover, workspace: project.workspace, resolution, watermark: planDef.watermark, absolute: true });
      const job = await prisma.renderJob.create({
        data: {
          projectId: project.id,
          userId: user.id,
          engine: env.renderEngine,
          priority: planDef.priorityRendering ? 10 : 0,
          inputProps: props,
          width: props.width,
          height: props.height,
          fps: props.fps,
          durationInFrames: Math.max(1, Math.round((props.durationMs / 1000) * props.fps)),
          watermark: planDef.watermark,
          creditsCharged: cost,
        },
      });
      await prisma.project.update({ where: { id: project.id }, data: { status: "RENDERING" } });
      revalidatePath(`/studio/${project.id}`);
      revalidatePath("/exports");
      return { renderJobId: job.id, creditsCharged: cost, resolution };
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — le rendu n'a pas pu être mis en file", project.id);
      throw err;
    }
  });
}

export async function cancelRender(renderJobId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const job = await prisma.renderJob.findFirstOrThrow({ where: { id: renderJobId, userId: user.id } });
    if (job.status !== "QUEUED") throw new Error("Seuls les rendus en attente peuvent être annulés.");
    await prisma.renderJob.update({ where: { id: job.id }, data: { status: "CANCELLED", step: "cancelled" } });
    if (job.creditsCharged > 0) await refundCredits(user.id, job.creditsCharged, "Remboursement — rendu annulé", job.id);
    await prisma.project.update({ where: { id: job.projectId }, data: { status: "READY" } });
    revalidatePath("/exports");
    return undefined;
  });
}

export async function deleteRender(renderJobId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const job = await prisma.renderJob.findFirstOrThrow({ where: { id: renderJobId, userId: user.id } });
    if (job.status === "PROCESSING") throw new Error("Attendez la fin du rendu avant de le supprimer.");
    await prisma.renderJob.delete({ where: { id: job.id } });
    revalidatePath("/exports");
    return undefined;
  });
}
