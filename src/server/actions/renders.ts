"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { renderRequestSchema } from "@/lib/validations";
import { refundCredits } from "@/lib/credits";
import { queueRender, type QueuedRender } from "@/lib/pipeline/render";
import { guard, type ActionResult } from "@/server/action-result";

export async function enqueueRender(input: unknown): Promise<ActionResult<QueuedRender>> {
  return guard(async () => {
    const sessionUser = await requireUser();
    const data = renderRequestSchema.parse(input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    const queued = await queueRender(user, data.projectId, data.resolution);
    revalidatePath(`/studio/${data.projectId}`);
    revalidatePath("/exports");
    return queued;
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
