"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publishRequestSchema } from "@/lib/validations";
import { PLANS } from "@/lib/plans";
import { executePublishJob } from "@/lib/publish";
import { guard, type ActionResult } from "@/server/action-result";

export async function schedulePublish(input: unknown): Promise<ActionResult<{ publishJobId: string; status: string }>> {
  return guard(async () => {
    const sessionUser = await requireUser();
    const data = publishRequestSchema.parse(input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    const render = await prisma.renderJob.findFirstOrThrow({ where: { id: data.renderJobId, userId: user.id } });
    if (render.status !== "COMPLETED" || !render.outputUrl) throw new Error("Ce rendu n'est pas encore terminé.");
    const account = await prisma.socialAccount.findFirstOrThrow({ where: { id: data.socialAccountId, userId: user.id } });

    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : new Date();
    const isFuture = scheduledAt.getTime() > Date.now() + 60_000;
    if (isFuture && !PLANS[user.plan].scheduling) throw new Error("La programmation des publications est disponible à partir du forfait Créateur.");

    const job = await prisma.publishJob.create({
      data: {
        renderJobId: render.id,
        projectId: render.projectId,
        userId: user.id,
        socialAccountId: account.id,
        platform: account.platform,
        scheduledAt,
        title: data.title,
        caption: data.caption,
        hashtags: data.hashtags,
        privacy: data.privacy,
      },
    });

    if (!isFuture) {
      await prisma.publishJob.update({ where: { id: job.id }, data: { status: "PUBLISHING", lockedAt: new Date(), attempts: 1 } });
      try {
        await executePublishJob(job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.publishJob.update({ where: { id: job.id }, data: { status: "FAILED", error: message.slice(0, 2000), lockedAt: null } });
        throw new Error(`Échec de la publication : ${message}`);
      }
    }
    revalidatePath("/exports");
    const final = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
    return { publishJobId: job.id, status: final.status };
  });
}

export async function cancelPublish(publishJobId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const job = await prisma.publishJob.findFirstOrThrow({ where: { id: publishJobId, userId: user.id } });
    if (job.status !== "SCHEDULED" && job.status !== "FAILED") throw new Error("Seules les publications programmées ou en échec peuvent être annulées.");
    await prisma.publishJob.update({ where: { id: job.id }, data: { status: "CANCELLED" } });
    revalidatePath("/exports");
    return undefined;
  });
}

export async function retryPublish(publishJobId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const job = await prisma.publishJob.findFirstOrThrow({ where: { id: publishJobId, userId: user.id } });
    if (job.status !== "FAILED") throw new Error("Seules les publications en échec peuvent être relancées.");
    await prisma.publishJob.update({ where: { id: job.id }, data: { status: "SCHEDULED", attempts: 0, error: null, scheduledAt: new Date() } });
    revalidatePath("/exports");
    return undefined;
  });
}

export async function disconnectSocialAccount(accountId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    await prisma.socialAccount.delete({ where: { id: accountId, userId: user.id } });
    revalidatePath("/exports");
    revalidatePath("/settings");
    return undefined;
  });
}
