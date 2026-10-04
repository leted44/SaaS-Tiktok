"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { readResultScreenshots } from "@/lib/ai/results-reader";
import { refreshLessons, saveResult } from "@/lib/results/lessons";
import { postFormatSchema, postMetricsSchema, postPlatformSchema, type PostMetrics } from "@/lib/results/metrics";
import { guard, type ActionResult } from "@/server/action-result";

/**
 * The results loop, from the creator's side: read a post's statistics
 * screenshots, save its numbers, and look after the account's lessons. Free:
 * the more results come in, the better every later post gets.
 */

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

export interface SavedResult {
  id: string;
  platform: string;
  format: string;
  diagnosis: string | null;
  metrics: PostMetrics;
  updatedAt: string;
}

function toSaved(row: { id: string; platform: string; format: string; diagnosis: string | null; updatedAt: Date } & PostMetrics): SavedResult {
  const metrics = Object.fromEntries(Object.keys(postMetricsSchema.shape).map((k) => [k, row[k as keyof PostMetrics] ?? null])) as PostMetrics;
  return { id: row.id, platform: row.platform, format: row.format, diagnosis: row.diagnosis, metrics, updatedAt: row.updatedAt.toISOString() };
}

/** The numbers read off up to three screenshots of one post's statistics — shown to the creator to check before saving. */
export async function readResultScreenshotsAction(projectId: string, form: FormData): Promise<ActionResult<{ platform: string; metrics: PostMetrics; unreadable: string }>> {
  return guard(async () => {
    const user = await requireUser();
    const format = postFormatSchema.parse(form.get("format"));
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } });
    if (!project) throw new Error("Ce projet n'existe plus.");
    const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error("Ajoute au moins une capture d'écran.");
    if (files.length > MAX_SCREENSHOTS) throw new Error(`${MAX_SCREENSHOTS} captures au maximum.`);
    if (files.some((f) => f.size > MAX_SCREENSHOT_BYTES)) throw new Error("Une capture est trop lourde (8 Mo au maximum).");
    const images = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    return readResultScreenshots(images, format);
  });
}

const saveSchema = z.object({
  projectId: z.string().min(1),
  platform: postPlatformSchema,
  format: postFormatSchema,
  metrics: postMetricsSchema,
  source: z.enum(["screenshot", "manual"]),
});

/** Saves a post's numbers on one platform and returns its diagnosis; the account's lessons are rewritten in the background. */
export async function saveResultAction(input: unknown): Promise<ActionResult<SavedResult>> {
  return guard(async () => {
    const user = await requireUser();
    const data = saveSchema.parse(input);
    if (!Object.values(data.metrics).some((v) => v != null)) throw new Error("Renseigne au moins un chiffre.");
    const saved = await saveResult({ userId: user.id, ...data });
    after(() => refreshLessons(user.id, saved.spaceId).catch((err) => console.error("[results] lessons refresh failed:", err)));
    revalidatePath("/lessons");
    return toSaved(saved);
  });
}

export async function projectResultsAction(projectId: string): Promise<ActionResult<SavedResult[]>> {
  return guard(async () => {
    const user = await requireUser();
    const rows = await prisma.postResult.findMany({ where: { projectId, userId: user.id }, orderBy: { updatedAt: "desc" } });
    return rows.map(toSaved);
  });
}

export async function deleteResultAction(resultId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const row = await prisma.postResult.findFirst({ where: { id: resultId, userId: user.id }, select: { id: true, spaceId: true } });
    if (!row) throw new Error("Ce résultat n'existe plus.");
    await prisma.postResult.delete({ where: { id: row.id } });
    after(() => refreshLessons(user.id, row.spaceId).catch((err) => console.error("[results] lessons refresh failed:", err)));
    revalidatePath("/lessons");
    return undefined;
  });
}

/** Rewrites a lesson in the creator's own words: it is then kept as written by every later refresh. */
export async function updateLessonAction(lessonId: string, text: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const clean = z.string().trim().min(5, "La leçon est trop courte.").max(400, "400 caractères au maximum.").parse(text);
    const { count } = await prisma.accountLesson.updateMany({ where: { id: lessonId, userId: user.id }, data: { text: clean, pinned: true, dismissed: false } });
    if (!count) throw new Error("Cette leçon n'existe plus.");
    revalidatePath("/lessons");
    return undefined;
  });
}

/** Removes a lesson for good: it stays recorded only so it is never proposed again. */
export async function dismissLessonAction(lessonId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const { count } = await prisma.accountLesson.updateMany({ where: { id: lessonId, userId: user.id }, data: { dismissed: true, pinned: false } });
    if (!count) throw new Error("Cette leçon n'existe plus.");
    revalidatePath("/lessons");
    return undefined;
  });
}

/** Rewrites a space's lessons now, from all its results. */
export async function refreshLessonsAction(spaceId: string | null): Promise<ActionResult<{ lessons: number; posts: number }>> {
  return guard(async () => {
    const user = await requireUser();
    if (spaceId) {
      const space = await prisma.space.findFirst({ where: { id: spaceId, userId: user.id }, select: { id: true } });
      if (!space) throw new Error("Cet espace n'existe plus.");
    }
    const outcome = await refreshLessons(user.id, spaceId);
    revalidatePath("/lessons");
    return outcome;
  });
}
