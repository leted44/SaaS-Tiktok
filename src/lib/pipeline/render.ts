import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, effectivePlanDef, clampResolution, renderCost } from "@/lib/plans";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { env } from "@/lib/env";

export interface QueuedRender {
  renderJobId: string;
  creditsCharged: number;
  resolution: string;
}

/**
 * Put a project's current edit in the render queue for a user. Shared by the
 * studio's export button and the autopilot: same plan resolution cap, same
 * watermark rule, same price.
 */
export async function queueRender(user: User, projectId: string, requested: "720p" | "1080p" | "4K"): Promise<QueuedRender> {
  const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, include: { workspace: true } });
  const script = project.activeScriptId
    ? await prisma.script.findUnique({ where: { id: project.activeScriptId } })
    : await prisma.script.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" } });
  if (!script) throw new Error("Générez un script avant de lancer le rendu.");
  const voiceover = await prisma.voiceover.findFirst({ where: { projectId: project.id, scriptId: script.id, status: "READY" }, orderBy: { createdAt: "desc" } });

  const active = await prisma.renderJob.count({ where: { projectId: project.id, status: { in: ["QUEUED", "PROCESSING"] } } });
  if (active > 0) throw new Error("Un rendu est déjà en cours pour ce projet.");

  const planDef = effectivePlanDef(user);
  const resolution = clampResolution(requested, planDef.maxResolution);
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
    return { renderJobId: job.id, creditsCharged: cost, resolution };
  } catch (err) {
    if (cost > 0) await refundCredits(user.id, cost, "Remboursement — le rendu n'a pas pu être mis en file", project.id);
    throw err;
  }
}
