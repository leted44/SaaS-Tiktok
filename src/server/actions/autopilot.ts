"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { effectivePlanDef } from "@/lib/plans";
import { getCurrentWorkspace } from "@/server/queries";
import { ACTIVE_STATUSES } from "@/lib/autopilot/engine";
import { validateTemplate, templateInputFromProject } from "@/lib/autopilot/templates";
import { TONES, MIN_DURATION_SEC, MAX_DURATION_SEC, type TemplateInput } from "@/lib/autopilot/template-shared";
import { sendPush } from "@/lib/push";
import { guard, type ActionResult } from "@/server/action-result";

const MIN_LEAD_MS = 2 * 60_000;
const MAX_HORIZON_MS = 90 * 24 * 3600_000;
const MAX_VIDEOS_PER_BATCH = 30;

async function requireAutopilotUser() {
  const user = await requireDbUser();
  const plan = effectivePlanDef(user);
  if (plan.autopilotQueue === 0) throw new Error("Le pilote automatique est réservé aux forfaits Pro et Agence.");
  return { user, plan };
}

/** First validation message, in French, instead of a generic one. */
function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Données invalides.");
  return result.data;
}

// ───────────────────────── Templates ─────────────────────────

/** Create (id = null) or update a template. The first one becomes the default. */
export async function saveTemplateAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { user } = await requireAutopilotUser();
    const t = await validateTemplate(user, input);
    const workspace = await getCurrentWorkspace();
    const existing = id ? await prisma.videoTemplate.findFirst({ where: { id, userId: user.id } }) : null;
    if (id && !existing) throw new Error("Ce modèle n'existe plus.");
    const count = await prisma.videoTemplate.count({ where: { userId: user.id } });
    // There is always exactly one default: the first template is it, and the default can only be moved, not removed.
    const isDefault = count === 0 || (existing?.isDefault ?? false) || t.isDefault;

    const data = { ...t, isDefault, captionStyle: t.captionStyle, backgroundStyle: t.backgroundStyle };
    const saved = await prisma.$transaction(async (tx) => {
      if (isDefault) await tx.videoTemplate.updateMany({ where: { userId: user.id, isDefault: true, ...(existing ? { id: { not: existing.id } } : {}) }, data: { isDefault: false } });
      return existing
        ? tx.videoTemplate.update({ where: { id: existing.id }, data })
        : tx.videoTemplate.create({ data: { ...data, userId: user.id, workspaceId: workspace.id } });
    });
    revalidatePath("/autopilot");
    return { id: saved.id };
  });
}

export async function setDefaultTemplateAction(id: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const { user } = await requireAutopilotUser();
    await prisma.videoTemplate.findFirstOrThrow({ where: { id, userId: user.id } });
    await prisma.$transaction([
      prisma.videoTemplate.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } }),
      prisma.videoTemplate.update({ where: { id }, data: { isDefault: true } }),
    ]);
    revalidatePath("/autopilot");
    return undefined;
  });
}

/**
 * Delete a template. Videos scheduled with it but not started yet move to the
 * default template (or the newest other one, which then becomes the default);
 * videos already in production keep the settings they started with.
 */
export async function deleteTemplateAction(id: string): Promise<ActionResult<{ movedTo: string | null; moved: number }>> {
  return guard(async () => {
    const { user } = await requireAutopilotUser();
    const template = await prisma.videoTemplate.findFirstOrThrow({ where: { id, userId: user.id } });
    const heir =
      (await prisma.videoTemplate.findFirst({ where: { userId: user.id, isDefault: true, id: { not: id } } })) ??
      (await prisma.videoTemplate.findFirst({ where: { userId: user.id, id: { not: id } }, orderBy: { updatedAt: "desc" } }));
    const waiting = await prisma.autopilotItem.count({ where: { templateId: id, status: "SCHEDULED" } });
    if (waiting > 0 && !heir) throw new Error(`${waiting} vidéo${waiting > 1 ? "s" : ""} programmée${waiting > 1 ? "s" : ""} utilise${waiting > 1 ? "nt" : ""} ce modèle. Crée un autre modèle avant de le supprimer, ou annule ces vidéos.`);

    await prisma.$transaction(async (tx) => {
      if (heir) {
        await tx.autopilotItem.updateMany({ where: { templateId: id, status: "SCHEDULED" }, data: { templateId: heir.id } });
        if (template.isDefault) await tx.videoTemplate.update({ where: { id: heir.id }, data: { isDefault: true } });
      }
      await tx.videoTemplate.delete({ where: { id } });
    });
    revalidatePath("/autopilot");
    return { movedTo: heir?.name ?? null, moved: waiting };
  });
}

/** A copy to make a variant from (another voice, another format…). Never the default. */
export async function duplicateTemplateAction(id: string): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { user } = await requireAutopilotUser();
    const source = await prisma.videoTemplate.findFirst({ where: { id, userId: user.id } });
    if (!source) throw new Error("Ce modèle n'existe plus.");
    const { id: _id, createdAt: _c, updatedAt: _u, captionStyle, backgroundStyle, ...rest } = source;
    const copy = await prisma.videoTemplate.create({
      data: { ...rest, captionStyle: captionStyle ?? {}, backgroundStyle: backgroundStyle ?? {}, name: `${source.name.slice(0, 52)} (copie)`, isDefault: false },
    });
    revalidatePath("/autopilot");
    return { id: copy.id };
  });
}

/** The style of one of the user's videos, as template settings for the editor to start from. */
export async function templateFromProjectAction(projectId: string): Promise<ActionResult<TemplateInput>> {
  return guard(async () => {
    const { user, plan } = await requireAutopilotUser();
    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, include: { workspace: true } });
    return templateInputFromProject(project, plan);
  });
}

// ───────────────────────── Scheduling ─────────────────────────

const scheduleSchema = z
  .object({
    templateId: z.string().min(1, "Choisis un modèle."),
    /** One entry per video. Times are worked out in the browser, in the user's own time zone. */
    videos: z
      .array(
        z.object({
          topic: z.string().trim().max(1200, "Un thème est trop long (1 200 caractères maximum)."),
          deliverAt: z.string().datetime({ offset: true, message: "Date de livraison invalide." }),
        }),
      )
      .min(1, "Écris au moins un thème.")
      .max(MAX_VIDEOS_PER_BATCH, `${MAX_VIDEOS_PER_BATCH} vidéos au maximum à la fois.`),
    tone: z.enum(TONES),
    targetDurationSec: z.number().int().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC),
    spaceId: z.string().min(1).nullable().default(null),
    /** Set when the AI picks each topic: the theme to invent them from. The topics sent are then ignored. */
    topicBrief: z
      .string()
      .trim()
      .min(15, "Décris la thématique en une phrase au moins, pour que l'IA sache de quoi parler.")
      .max(600, "Thématique trop longue (600 caractères maximum).")
      .nullable()
      .default(null),
  })
  .superRefine((d, ctx) => {
    if (!d.topicBrief && d.videos.some((v) => v.topic.length < 3)) ctx.addIssue({ code: "custom", message: "Chaque thème doit faire au moins 3 caractères.", path: ["videos"] });
  });

/** Queue one video, or a series (one theme per video, each with its own time), to be made from a template. */
export async function scheduleAutopilotAction(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  return guard(async () => {
    const { user, plan } = await requireAutopilotUser();
    const data = parseOrThrow(scheduleSchema, input);
    const template = await prisma.videoTemplate.findFirst({ where: { id: data.templateId, userId: user.id } });
    if (!template) throw new Error("Ce modèle n'existe plus. Choisis-en un autre.");
    if (data.spaceId && !(await prisma.space.findFirst({ where: { id: data.spaceId, userId: user.id }, select: { id: true } }))) {
      throw new Error("Cet espace n'existe plus. Choisis-en un autre.");
    }

    const now = Date.now();
    const times = data.videos.map((v) => new Date(v.deliverAt));
    if (times.some((t) => t.getTime() < now + MIN_LEAD_MS)) throw new Error("Choisis une heure dans au moins 2 minutes.");
    if (times.some((t) => t.getTime() > now + MAX_HORIZON_MS)) throw new Error("La programmation est limitée à 90 jours : réduis le nombre de thèmes ou l'intervalle.");

    const queued = await prisma.autopilotItem.count({ where: { userId: user.id, status: { in: ACTIVE_STATUSES } } });
    if (queued + data.videos.length > plan.autopilotQueue) {
      throw new Error(`Ta file est limitée à ${plan.autopilotQueue} vidéos avec ton forfait (${queued} déjà en file).`);
    }

    const created = await prisma.$transaction(
      data.videos.map((v, i) =>
        prisma.autopilotItem.create({
          data: {
            userId: user.id,
            workspaceId: template.workspaceId,
            templateId: template.id,
            spaceId: data.spaceId,
            topic: data.topicBrief ? "" : v.topic,
            topicBrief: data.topicBrief,
            tone: data.tone,
            targetDurationSec: data.targetDurationSec,
            language: template.language,
            deliverAt: times[i],
          },
          select: { id: true },
        }),
      ),
    );
    // A theme typed here for a space that had none becomes the space's own, so it is there next time.
    if (data.spaceId && data.topicBrief) {
      await prisma.space.updateMany({ where: { id: data.spaceId, userId: user.id, brief: null }, data: { brief: data.topicBrief } });
    }
    revalidatePath("/autopilot");
    return { ids: created.map((c) => c.id) };
  });
}

const testSchema = z.object({ templateId: z.string().min(1), topic: z.string().trim().min(3, "Écris un thème de test.").max(1200) });

/**
 * Make one video from a template right now, delivered a few minutes from now:
 * the whole chain — script, voice, visuals, render, notification — checked
 * end to end on a real video before relying on the template.
 */
export async function testTemplateAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const { user, plan } = await requireAutopilotUser();
    const data = parseOrThrow(testSchema, input);
    const template = await prisma.videoTemplate.findFirst({ where: { id: data.templateId, userId: user.id } });
    if (!template) throw new Error("Ce modèle n'existe plus.");
    const queued = await prisma.autopilotItem.count({ where: { userId: user.id, status: { in: ACTIVE_STATUSES } } });
    if (queued >= plan.autopilotQueue) throw new Error(`Ta file est pleine (${plan.autopilotQueue} vidéos au maximum).`);
    const item = await prisma.autopilotItem.create({
      data: { userId: user.id, workspaceId: template.workspaceId, templateId: template.id, topic: data.topic, tone: template.tone, targetDurationSec: template.targetDurationSec, language: template.language, deliverAt: new Date(Date.now() + 5 * 60_000) },
    });
    revalidatePath("/autopilot");
    return { id: item.id };
  });
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
    const { count } = await prisma.autopilotItem.updateMany({ where: { id, userId: user.id, status: { in: ACTIVE_STATUSES } }, data: { status: "CANCELLED", lockedAt: null, retryAt: null } });
    if (!count) throw new Error("Cette vidéo n'est plus en cours.");
    revalidatePath("/autopilot");
    return undefined;
  });
}

/** Resume a failed item at the step it stopped on, with the settings it started with. */
export async function retryAutopilotAction(id: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const item = await prisma.autopilotItem.findFirstOrThrow({ where: { id, userId: user.id } });
    if (item.status !== "FAILED") throw new Error("Seule une vidéo en échec peut être relancée.");
    const step = item.failedStep ?? "SCHEDULED";
    await prisma.autopilotItem.update({
      where: { id: item.id },
      // A failed render is queued afresh rather than re-checked.
      data: { status: step, failedStep: null, attempts: 0, error: null, lockedAt: null, retryAt: null, ...(step === "RENDERING" ? { renderJobId: null } : {}) },
    });
    revalidatePath("/autopilot");
    return undefined;
  });
}

/** Remove an item from the list. The project it produced stays in Projets. */
export async function deleteAutopilotAction(id: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const item = await prisma.autopilotItem.findFirstOrThrow({ where: { id, userId: user.id } });
    if (ACTIVE_STATUSES.includes(item.status)) throw new Error("Annule d'abord cette vidéo.");
    await prisma.autopilotItem.delete({ where: { id: item.id } });
    revalidatePath("/autopilot");
    return undefined;
  });
}

// ───────────────────────── Notifications ─────────────────────────

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Remember this browser so it can be notified. Re-subscribing moves it to the current user. */
export async function savePushSubscriptionAction(input: unknown, userAgent?: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireDbUser();
    const sub = parseOrThrow(subscriptionSchema, input);
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
