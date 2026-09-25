"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { parseJson, scenesSchema } from "@/lib/validations";
import { generateCarousel } from "@/lib/ai/carousel-generator";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { carouselSlidesSchema, carouselStateSchema, stripEmoji, limitsFor, type CarouselState } from "@/lib/carousel/schema";
import { copyStockImage, generateAndStoreSlideImage, isOwnStorageUrl } from "@/lib/carousel/images";
import { withAutoPhotos } from "@/lib/carousel/auto-photos";
import { integrations } from "@/lib/env";
import { guard, type ActionResult } from "@/server/action-result";

export interface CarouselSnapshot extends CarouselState {
  /** Changes on every save — the slide image URLs carry it so the preview never shows a stale render. */
  version: number;
}

/**
 * Write the carousel for a project from its current script.
 *
 * Regenerating replaces the text but keeps the design choices — template,
 * format and signature are the user's, not the model's.
 */
export async function generateCarouselAction(projectId: string): Promise<ActionResult<{ carousel: CarouselSnapshot; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, userId: user.id },
      include: { workspace: true, scripts: { orderBy: { version: "desc" } }, carousel: true },
    });
    const script = project.scripts.find((s) => s.id === project.activeScriptId) ?? project.scripts[0];
    if (!script) throw new Error("Générez d'abord un script pour ce projet : le carrousel est écrit à partir de lui.");

    const cost = isAdmin(user.role) ? 0 : CREDIT_COSTS.CAROUSEL;
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", "Génération du carrousel") : user.credits;

    let slides;
    try {
      slides = await generateCarousel({
        title: script.title,
        hook: script.hook,
        sceneTexts: parseJson(scenesSchema, script.scenes, []).map((s) => s.text),
        callToAction: script.callToAction,
        language: project.language,
        niche: project.niche,
        toneOfVoice: project.workspace.toneOfVoice,
        targetAudience: project.workspace.targetAudience,
      });
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la génération du carrousel a échoué");
      throw err;
    }

    slides = (await withAutoPhotos(user.id, slides, "generate")).slides;

    const saved = await prisma.carousel.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, userId: user.id, scriptId: script.id, slides },
      update: { scriptId: script.id, slides },
    });
    revalidatePath(`/studio/${project.id}/carousel`);
    return { carousel: toSnapshot(saved), creditsLeft };
  });
}

/** Autosave of the editor: text edits, template, format, signature. */
export async function saveCarouselAction(projectId: string, input: unknown): Promise<ActionResult<{ version: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    const state = carouselStateSchema.parse(input);
    const slides = carouselSlidesSchema.parse(
      state.slides.map((s) => {
        // Only a copy in our own storage may be rendered — see lib/carousel/images.
        const image = s.kind !== "cta" && s.image && isOwnStorageUrl(s.image.url) ? s.image : null;
        const limit = limitsFor({ kind: s.kind, image });
        return {
          ...s,
          image,
          kicker: stripEmoji(s.kicker).slice(0, limit.kicker),
          title: stripEmoji(s.title).slice(0, limit.title),
          body: stripEmoji(s.body).slice(0, limit.body),
          action: s.kind === "cta" ? stripEmoji(s.action).slice(0, limit.action) : "",
        };
      }),
    );
    const handle = state.handle?.trim() ? stripEmoji(state.handle.trim()).slice(0, 40) : null;
    const saved = await prisma.carousel.update({
      where: { projectId, userId: user.id },
      data: { template: state.template, format: state.format, handle, slides },
    });
    return { version: saved.updatedAt.getTime() };
  });
}

/**
 * Copy a stock photo the user picked into their storage, for a slide.
 *
 * Returns the stored URL; the editor then places it on the slide and the
 * autosave persists it, so this never races with a save in flight.
 */
export async function importCarouselImageAction(projectId: string, sourceUrl: string): Promise<ActionResult<{ url: string; source: string }>> {
  return guard(async () => {
    const user = await requireDbUser();
    await prisma.carousel.findFirstOrThrow({ where: { projectId, userId: user.id }, select: { id: true } });
    return { url: await copyStockImage(user.id, sourceUrl), source: sourceUrl };
  });
}

/**
 * Generate a photo for one slide with AI, instead of searching stock — the
 * exact scene the slide needs rather than the closest match a stock library
 * happens to have. `subject` is the slide's own imageQuery (or its title, if
 * that's empty): the same few English words already written for stock search.
 */
export async function generateSlideImageAction(projectId: string, subject: string): Promise<ActionResult<{ url: string; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.aiImages()) throw new Error("La génération d'images IA n'est pas configurée.");
    const row = await prisma.carousel.findFirstOrThrow({ where: { projectId, userId: user.id }, select: { format: true } });

    const cost = isAdmin(user.role) ? 0 : CREDIT_COSTS.AI_IMAGE;
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", "Image générée par IA") : user.credits;
    try {
      const url = await generateAndStoreSlideImage(user.id, subject.trim() || "an abstract, softly lit background texture", row.format as CarouselState["format"]);
      return { url, creditsLeft };
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la génération d'image a échoué");
      throw err;
    }
  });
}

/**
 * Put a photo on every slide that has none, keeping the ones already placed
 * and every word of the text — the carousel's "Remplir toutes les scènes".
 * Free, as stock search is everywhere else.
 */
export async function fillCarouselPhotosAction(
  projectId: string,
): Promise<ActionResult<{ carousel: CarouselSnapshot; changed: number; tooLong: number; unmatched: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.stock()) throw new Error("La recherche de photos n'est pas configurée (clé PEXELS_API_KEY manquante).");
    const row = await prisma.carousel.findFirstOrThrow({ where: { projectId, userId: user.id } });
    const { slides } = toSnapshot(row);

    const result = await withAutoPhotos(user.id, slides, "fill");
    const saved = await prisma.carousel.update({ where: { id: row.id }, data: { slides: result.slides } });
    return { carousel: toSnapshot(saved), changed: result.changed, tooLong: result.tooLong, unmatched: result.unmatched };
  });
}

type CarouselRow = { template: string; format: string; handle: string | null; slides: unknown; updatedAt: Date };

function toSnapshot(row: CarouselRow): CarouselSnapshot {
  const state = carouselStateSchema.parse({ template: row.template, format: row.format, handle: row.handle, slides: row.slides });
  return { ...state, version: row.updatedAt.getTime() };
}
