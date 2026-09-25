"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { parseJson, scenesSchema } from "@/lib/validations";
import { generateCarousel } from "@/lib/ai/carousel-generator";
import { generateImage } from "@/lib/ai/image-generator";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { carouselSlidesSchema, carouselStateFromRow, carouselStateSchema, stripEmoji, limitsFor, needsAiVisual, tooLongForImage, type CarouselState } from "@/lib/carousel/schema";
import { copyStockImage, isOwnStorageUrl, storeGeneratedImage } from "@/lib/ai/images";
import { withAutoPhotos } from "@/lib/carousel/auto-photos";
import { aiSource, DEFAULT_VISUAL_STYLE, VISUAL_STYLES, type VisualStyle } from "@/lib/carousel/art-direction";
import { coverReference, generateSeries, promptFor } from "@/lib/carousel/ai-visuals";
import { integrations } from "@/lib/env";
import { guard, type ActionResult } from "@/server/action-result";

export interface CarouselSnapshot extends CarouselState {
  /** Changes on every save — the slide image URLs carry it so the preview never shows a stale render. */
  version: number;
}

const asStyle = (value: unknown): VisualStyle | null => ((VISUAL_STYLES as readonly unknown[]).includes(value) ? (value as VisualStyle) : null);

/**
 * Write the carousel for a project from its current script.
 *
 * With AI visuals the text comes back without images: the editor asks for
 * them right after, as a separate request, so writing and illustrating each
 * fit in one request's time budget. With stock photos, they are found here.
 *
 * Regenerating replaces the text but keeps the design choices — template,
 * format and signature are the user's, not the model's.
 */
export async function generateCarouselAction(
  projectId: string,
  options: { visuals: "ai" | "stock"; visualStyle?: VisualStyle } = { visuals: "stock" },
): Promise<ActionResult<{ carousel: CarouselSnapshot; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, userId: user.id },
      include: { workspace: true, scripts: { orderBy: { version: "desc" } }, carousel: true },
    });
    const script = project.scripts.find((s) => s.id === project.activeScriptId) ?? project.scripts[0];
    if (!script) throw new Error("Générez d'abord un script pour ce projet : le carrousel est écrit à partir de lui.");
    const ai = options.visuals === "ai";
    if (ai && !integrations.aiImages()) throw new Error("La génération d'images IA n'est pas configurée.");

    const visualStyle = asStyle(options.visualStyle) ?? asStyle(project.carousel?.visualStyle) ?? DEFAULT_VISUAL_STYLE;
    const cost = isAdmin(user.role) ? 0 : CREDIT_COSTS.CAROUSEL;
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", "Génération du carrousel") : user.credits;

    let generated;
    try {
      generated = await generateCarousel({
        title: script.title,
        hook: script.hook,
        sceneTexts: parseJson(scenesSchema, script.scenes, []).map((s) => s.text),
        callToAction: script.callToAction,
        language: project.language,
        niche: project.niche,
        toneOfVoice: project.workspace.toneOfVoice,
        targetAudience: project.workspace.targetAudience,
        visualStyle,
      });
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la génération du carrousel a échoué");
      throw err;
    }

    const slides = ai ? generated.slides : (await withAutoPhotos(user.id, generated.slides, "generate")).slides;
    const art = { visualStyle: ai ? visualStyle : (project.carousel?.visualStyle ?? null), visualMotif: generated.visualMotif };

    const saved = await prisma.carousel.upsert({
      where: { projectId: project.id },
      // A first carousel made with AI visuals starts on the template designed for them.
      create: { projectId: project.id, userId: user.id, scriptId: script.id, slides, ...art, ...(ai ? { template: "immersive" } : {}) },
      update: { scriptId: script.id, slides, ...art },
    });
    revalidatePath(`/studio/${project.id}/carousel`);
    return { carousel: toSnapshot(saved), creditsLeft };
  });
}

/** Autosave of the editor: text edits, template, format, signature, art direction. */
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
          emphasis: stripEmoji(s.emphasis).trim(),
          imagePrompt: stripEmoji(s.imagePrompt).trim(),
        };
      }),
    );
    const handle = state.handle?.trim() ? stripEmoji(state.handle.trim()).slice(0, 40) : null;
    const saved = await prisma.carousel.update({
      where: { projectId, userId: user.id },
      data: { template: state.template, format: state.format, handle, slides, visualStyle: state.visualStyle, visualMotif: stripEmoji(state.visualMotif).trim() || null },
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
 * Generate (or regenerate) the AI visual of one slide, in the carousel's art
 * direction and matched to its cover. `scene` is the brief as it stands in
 * the editor, so an edit not yet autosaved is used as typed.
 *
 * Like a stock pick, the image comes back to the editor, which places it and
 * lets the autosave persist it.
 */
export async function generateSlideImageAction(
  projectId: string,
  slideId: string,
  scene?: string,
): Promise<ActionResult<{ url: string; source: string; visualStyle: VisualStyle; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.aiImages()) throw new Error("La génération d'images IA n'est pas configurée.");
    const row = await prisma.carousel.findFirstOrThrow({ where: { projectId, userId: user.id } });
    const state = toSnapshot(row);
    const slide = state.slides.find((s) => s.id === slideId);
    if (!slide || slide.kind === "cta") throw new Error("Cette slide n'accepte pas d'image.");
    if (tooLongForImage(slide)) throw new Error("Raccourcis d'abord le texte de cette slide : l'image prend une partie de la place.");

    const visualStyle = state.visualStyle ?? DEFAULT_VISUAL_STYLE;
    const series = { template: state.template, format: state.format, visualMotif: state.visualMotif, visualStyle };
    const reference = slide.kind === "cover" ? null : await coverReference(state.slides, visualStyle);

    const cost = isAdmin(user.role) ? 0 : CREDIT_COSTS.AI_IMAGE;
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", "Image générée par IA") : user.credits;
    try {
      const bytes = await generateImage({ ...promptFor(slide, series, scene), reference });
      const url = await storeGeneratedImage(user.id, bytes);
      return { url, source: aiSource(visualStyle), visualStyle, creditsLeft };
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la génération d'image a échoué");
      throw err;
    }
  });
}

/**
 * Give the whole carousel its AI visuals as one series.
 *
 * "missing" fills every slide that has no image in the current style —
 * including stock photos, since mixing sources is what makes a carousel look
 * assembled rather than designed — and keeps photos the user uploaded.
 * "all" regenerates every image. Credits are taken for every image up front,
 * and refunded one by one for those that fail.
 */
export async function generateCarouselVisualsAction(
  projectId: string,
  mode: "missing" | "all" = "missing",
): Promise<ActionResult<{ carousel: CarouselSnapshot; generated: number; failed: number; tooLong: number; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.aiImages()) throw new Error("La génération d'images IA n'est pas configurée.");
    const row = await prisma.carousel.findFirstOrThrow({ where: { projectId, userId: user.id } });
    const state = toSnapshot(row);
    const visualStyle = state.visualStyle ?? DEFAULT_VISUAL_STYLE;

    const candidates = state.slides.filter((s) => s.kind !== "cta" && (mode === "all" || needsAiVisual(s, visualStyle)));
    const tooLong = candidates.filter(tooLongForImage).length;
    const targets = candidates.filter((s) => !tooLongForImage(s));
    if (!targets.length) {
      if (tooLong) throw new Error("Les slides sans visuel ont trop de texte pour une image : raccourcis-les d'abord.");
      return { carousel: state, generated: 0, failed: 0, tooLong, creditsLeft: user.credits };
    }

    const unit = isAdmin(user.role) ? 0 : CREDIT_COSTS.AI_IMAGE;
    const total = unit * targets.length;
    let creditsLeft = total > 0 ? await chargeCredits(user.id, total, "SCRIPT_GENERATION", `${targets.length} images générées par IA`) : user.credits;

    const outcomes = await generateSeries(user.id, state.slides, targets, { template: state.template, format: state.format, visualMotif: state.visualMotif, visualStyle });
    const failures = outcomes.filter((o) => !o.image);
    if (failures.length && unit > 0) {
      creditsLeft = await refundCredits(user.id, unit * failures.length, `Remboursement — ${failures.length} image${failures.length > 1 ? "s" : ""} non générée${failures.length > 1 ? "s" : ""}`);
    }
    const generated = outcomes.length - failures.length;
    if (!generated) throw new Error(failures[0]?.error ?? "Aucune image n'a pu être générée. Réessaie dans un instant.");

    const images = new Map(outcomes.filter((o) => o.image).map((o) => [o.slideId, o.image!]));
    const slides = state.slides.map((s) => (images.has(s.id) ? { ...s, image: images.get(s.id)! } : s));
    const saved = await prisma.carousel.update({ where: { id: row.id }, data: { slides, visualStyle } });
    return { carousel: toSnapshot(saved), generated, failed: failures.length, tooLong, creditsLeft };
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

type CarouselRow = Parameters<typeof carouselStateFromRow>[0] & { updatedAt: Date };

function toSnapshot(row: CarouselRow): CarouselSnapshot {
  const parsed = carouselStateFromRow(row);
  if (!parsed.success) throw new Error("Ce carrousel est illisible.");
  return { ...parsed.data, version: row.updatedAt.getTime() };
}
