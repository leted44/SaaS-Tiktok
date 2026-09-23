"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { parseJson, scenesSchema } from "@/lib/validations";
import { generateCarousel } from "@/lib/ai/carousel-generator";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { carouselSlidesSchema, carouselStateSchema, stripEmoji, SLIDE_LIMITS, type CarouselState } from "@/lib/carousel/schema";
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
        const limit = SLIDE_LIMITS[s.kind];
        return { ...s, kicker: stripEmoji(s.kicker).slice(0, limit.kicker), title: stripEmoji(s.title).slice(0, limit.title), body: stripEmoji(s.body).slice(0, limit.body) };
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

type CarouselRow = { template: string; format: string; handle: string | null; slides: unknown; updatedAt: Date };

function toSnapshot(row: CarouselRow): CarouselSnapshot {
  const state = carouselStateSchema.parse({ template: row.template, format: row.format, handle: row.handle, slides: row.slides });
  return { ...state, version: row.updatedAt.getTime() };
}
