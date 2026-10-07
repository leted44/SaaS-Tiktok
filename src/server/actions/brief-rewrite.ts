"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { isAdmin } from "@/lib/plans";
import { parseJson, scenesSchema } from "@/lib/validations";
import { carouselSlidesSchema, imageLayout, type CarouselTemplate } from "@/lib/carousel/schema";
import { rewriteBriefs, type BriefItem } from "@/lib/ai/brief-rewriter";
import { castTextFor } from "@/lib/characters";
import { guard, type ActionResult } from "@/server/action-result";

/**
 * "Réécrire les descriptions d'image" (admin): the image briefs of a finished
 * script or carousel written again from the Fil conducteur as it is now
 * (lib/ai/brief-rewriter) — one Claude call, no credits, nothing else
 * touched. Admin only for now: it is a paid call the creator did not ask for
 * by writing a script.
 */

export interface VideoBriefs {
  hook: string;
  scenes: Record<string, string>;
}

async function adminUser() {
  const user = await requireDbUser();
  if (!isAdmin(user.role)) throw new Error("Réservé à l'administrateur.");
  return user;
}

/** Write briefs onto the active script in place: its voice-over stays attached, which a new version would not. */
async function writeVideoBriefs(scriptId: string, scenesJson: unknown, briefs: VideoBriefs) {
  const scenes = parseJson(scenesSchema, scenesJson, []).map((s) => ({ ...s, visualDescription: briefs.scenes[s.id] ?? s.visualDescription }));
  await prisma.script.update({ where: { id: scriptId }, data: { scenes, hookVisual: briefs.hook.trim() || null } });
}

export async function rewriteVideoBriefsAction(projectId: string): Promise<ActionResult<{ previous: VideoBriefs; changed: number }>> {
  return guard(async () => {
    const user = await adminUser();
    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, include: { space: { select: { brief: true } } } });
    if (!project.activeScriptId) throw new Error("Ce projet n'a pas encore de script.");
    const script = await prisma.script.findFirstOrThrow({ where: { id: project.activeScriptId, projectId } });
    const scenes = parseJson(scenesSchema, script.scenes, []);
    if (!scenes.length) throw new Error("Ce script n'a pas de scène.");
    if (!project.visualMotif?.trim()) throw new Error("Le Fil conducteur est vide : écris-le d'abord (Visuels → Réglages avancés).");

    const items: BriefItem[] = [
      { key: "hook", label: "Hook (the very first image)", text: script.hook, current: script.hookVisual ?? "" },
      ...scenes.map((s, i) => ({ key: s.id, label: `Scene ${i + 1} of ${scenes.length}`, text: s.text, current: s.visualDescription })),
    ];
    const written = await rewriteBriefs({
      kind: "video",
      language: project.language,
      motif: project.visualMotif,
      cast: await castTextFor(user.id, project.id, project.spaceId),
      concept: project.space?.brief,
      items,
    });

    const previous: VideoBriefs = { hook: script.hookVisual ?? "", scenes: Object.fromEntries(scenes.map((s) => [s.id, s.visualDescription])) };
    const next: VideoBriefs = { hook: written.get("hook") ?? previous.hook, scenes: Object.fromEntries(scenes.map((s) => [s.id, written.get(s.id) ?? s.visualDescription])) };
    await writeVideoBriefs(script.id, script.scenes, next);
    revalidatePath(`/studio/${projectId}`);
    return { previous, changed: written.size };
  });
}

/** Put back the briefs a rewrite replaced. */
export async function restoreVideoBriefsAction(projectId: string, previous: VideoBriefs): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await adminUser();
    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, select: { activeScriptId: true } });
    if (!project.activeScriptId) throw new Error("Ce projet n'a pas de script.");
    const script = await prisma.script.findFirstOrThrow({ where: { id: project.activeScriptId, projectId }, select: { id: true, scenes: true } });
    await writeVideoBriefs(script.id, script.scenes, previous);
    revalidatePath(`/studio/${projectId}`);
    return undefined;
  });
}

/** The carousel's image prompts, slide id → new prompt, to patch into the editor (which autosaves them). */
export async function rewriteCarouselBriefsAction(projectId: string): Promise<ActionResult<{ prompts: Record<string, string> }>> {
  return guard(async () => {
    const user = await adminUser();
    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, include: { carousel: true, space: { select: { brief: true } } } });
    const carousel = project.carousel;
    if (!carousel) throw new Error("Ce carrousel n'existe pas encore.");
    if (!carousel.visualMotif?.trim()) throw new Error("Le Fil conducteur est vide : écris-le d'abord (Visuels).");
    const slides = parseJson(carouselSlidesSchema, carousel.slides, []);
    const targets = slides.filter((s) => s.kind !== "cta");
    if (!targets.length) throw new Error("Aucune slide n'a d'image IA à décrire.");

    const items: BriefItem[] = targets.map((s) => ({
      key: s.id,
      label: s.kind === "cover" ? "Cover slide" : `Slide ${slides.indexOf(s) + 1} of ${slides.length}`,
      text: [s.title, s.body].filter(Boolean).join(" — "),
      current: s.imagePrompt,
    }));
    const written = await rewriteBriefs({
      kind: "carousel",
      layout: imageLayout("content", carousel.template as CarouselTemplate),
      language: project.language,
      motif: carousel.visualMotif,
      cast: await castTextFor(user.id, project.id, project.spaceId),
      concept: project.space?.brief,
      items,
    });

    const prompts = Object.fromEntries(targets.map((s) => [s.id, written.get(s.id) ?? s.imagePrompt]));
    await prisma.carousel.update({ where: { projectId }, data: { slides: slides.map((s) => (s.id in prompts ? { ...s, imagePrompt: prompts[s.id] } : s)) as unknown as Prisma.InputJsonValue } });
    revalidatePath(`/studio/${projectId}/carousel`);
    return { prompts };
  });
}
