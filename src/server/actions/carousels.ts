"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { parseJson, scenesSchema } from "@/lib/validations";
import { generateCarousel } from "@/lib/ai/carousel-generator";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { carouselSlidesSchema, carouselStateSchema, stripEmoji, limitsFor, type CarouselSlide, type CarouselState } from "@/lib/carousel/schema";
import { copyStockImage, isOwnStorageUrl } from "@/lib/carousel/images";
import { searchStock } from "@/lib/stock/search";
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

    slides = await withCoverPhoto(user.id, slides);

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
export async function importCarouselImageAction(projectId: string, sourceUrl: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const user = await requireDbUser();
    await prisma.carousel.findFirstOrThrow({ where: { projectId, userId: user.id }, select: { id: true } });
    return { url: await copyStockImage(user.id, sourceUrl) };
  });
}

/**
 * Put a photo behind the cover when the stock libraries have one for it.
 *
 * Best effort by design: no stock key, no match, or a slow download all leave
 * the cover as the template draws it, which is already a finished design.
 */
async function withCoverPhoto(userId: string, slides: CarouselSlide[]): Promise<CarouselSlide[]> {
  const cover = slides[0];
  if (!cover || cover.kind !== "cover" || !cover.imageQuery || !integrations.stock()) return slides;
  try {
    const portrait = await searchStock(cover.imageQuery, "image", 5, true);
    const candidates = portrait.length ? portrait : await searchStock(cover.imageQuery, "image", 5, false);
    for (const candidate of candidates.slice(0, 3)) {
      try {
        const url = await copyStockImage(userId, candidate.url);
        return [{ ...cover, image: { url } }, ...slides.slice(1)];
      } catch {
        // Try the next match.
      }
    }
  } catch {
    // Stock search down: the cover keeps its designed, photo-free look.
  }
  return slides;
}

type CarouselRow = { template: string; format: string; handle: string | null; slides: unknown; updatedAt: Date };

function toSnapshot(row: CarouselRow): CarouselSnapshot {
  const state = carouselStateSchema.parse({ template: row.template, format: row.format, handle: row.handle, slides: row.slides });
  return { ...state, version: row.updatedAt.getTime() };
}
