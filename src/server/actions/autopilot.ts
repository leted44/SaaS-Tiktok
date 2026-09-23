"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { effectivePlanDef } from "@/lib/plans";
import { getCurrentWorkspace } from "@/server/queries";
import { ACTIVE_STATUSES, LEASE_MS } from "@/lib/autopilot/engine";
import { sendPush } from "@/lib/push";
import { guard, type ActionResult } from "@/server/action-result";

const MIN_LEAD_MS = 2 * 60_000;
const MAX_HORIZON_MS = 90 * 24 * 3600_000;

const scheduleSchema = z.object({
  topic: z.string().trim().min(3, "Décris le thème en quelques mots.").max(1200),
  deliverAt: z.string().datetime({ offset: true }),
  tone: z.enum(["energetic", "educational", "storytelling", "controversial", "calm", "humorous"]).default("energetic"),
  targetDurationSec: z.number().int().min(15).max(90).default(45),
});

/** Queue a video to be made and delivered at a given time. */
export async function scheduleAutopilotAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const user = await requireDbUser();
    const plan = effectivePlanDef(user);
    if (plan.autopilotQueue === 0) throw new Error("Le pilote automatique est réservé aux forfaits Pro et Agence.");
    const data = scheduleSchema.parse(input);

    const deliverAt = new Date(data.deliverAt);
    const now = Date.now();
    if (deliverAt.getTime() < now + MIN_LEAD_MS) throw new Error("Choisis une heure dans au moins 2 minutes.");
    if (deliverAt.getTime() > now + MAX_HORIZON_MS) throw new Error("La programmation est limitée à 90 jours.");

    const queued = await prisma.autopilotItem.count({ where: { userId: user.id, status: { in: ACTIVE_STATUSES } } });
    if (queued >= plan.autopilotQueue) throw new Error(`Ta file est pleine (${plan.autopilotQueue} vidéos au maximum avec ton forfait).`);

    const workspace = await getCurrentWorkspace();
    const item = await prisma.autopilotItem.create({
      data: { userId: user.id, workspaceId: workspace.id, topic: data.topic, tone: data.tone, targetDurationSec: data.targetDurationSec, language: workspace.defaultLanguage, deliverAt },
    });
    revalidatePath("/autopilot");
    return { id: item.id };
  });
}

/** An item a tick is working on right now cannot be changed under it. */
async function ownedIdle(id: string, userId: string) {
  const item = await prisma.autopilotItem.findFirstOrThrow({ where: { id, userId } });
  const leased = item.lockedAt && Date.now() - item.lockedAt.getTime() < LEASE_MS && item.attempts === 0;
  return { item, leased: Boolean(leased) };
}

/**
 * Stop an item. Allowed at any step: a step already running finishes, but its
 * result is dropped (the engine only writes to an item still at the step it
 * claimed). Credits already spent on finished steps are not refunded — that
 * work was done.
 */
export async function cancelAutopilotAction(id: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const { count } = await prisma.autopilotItem.updateMany({ where: { id, userId: user.id, status: { in: ACTIVE_STATUSES } }, data: { status: "CANCELLED", lockedAt: null } });
    if (!count) throw new Error("Cette vidéo n'est plus en cours.");
    revalidatePath("/autopilot");
    return undefined;
  });
}

/** Resume a failed item at the step it stopped on. */
export async function retryAutopilotAction(id: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const item = await prisma.autopilotItem.findFirstOrThrow({ where: { id, userId: user.id } });
    if (item.status !== "FAILED") throw new Error("Seule une vidéo en échec peut être relancée.");
    const step = item.failedStep ?? "SCHEDULED";
    await prisma.autopilotItem.update({
      where: { id: item.id },
      // A failed render is queued afresh rather than re-checked.
      data: { status: step, failedStep: null, attempts: 0, error: null, lockedAt: null, ...(step === "RENDERING" ? { renderJobId: null } : {}) },
    });
    revalidatePath("/autopilot");
    return undefined;
  });
}

/** Remove an item from the list. The project it produced stays in Projets. */
export async function deleteAutopilotAction(id: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const { item, leased } = await ownedIdle(id, user.id);
    if (leased) throw new Error("Une étape est en cours sur cette vidéo. Réessaie dans une minute.");
    await prisma.autopilotItem.delete({ where: { id: item.id } });
    revalidatePath("/autopilot");
    return undefined;
  });
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Remember this browser so it can be notified. Re-subscribing moves it to the current user. */
export async function savePushSubscriptionAction(input: unknown, userAgent?: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const sub = subscriptionSchema.parse(input);
    const data = { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null };
    await prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
    return undefined;
  });
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return undefined;
  });
}

export async function sendTestPushAction(): Promise<ActionResult<{ delivered: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    const delivered = await sendPush(user.id, { title: "Notifications activées", body: "Tu seras prévenu ici dès qu'une vidéo programmée est prête à publier.", url: "/autopilot", tag: "autopilot-test" });
    if (!delivered) throw new Error("Aucun appareil n'a reçu la notification. Réactive-les sur ce téléphone.");
    return { delivered };
  });
}
