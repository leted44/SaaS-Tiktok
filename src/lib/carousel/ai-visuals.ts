import { AiImageError, type GeneratedImage, type ImageModel } from "@/lib/ai/image-generator";
import { generateCheckedImage } from "@/lib/ai/checked-image";
import { aiSource, composeImagePrompt, type VisualStyle } from "@/lib/carousel/art-direction";
import { readOwnImage, storeGeneratedImage } from "@/lib/ai/images";
import { imageAspect, imageLayout, type CarouselSlide, type CarouselState } from "@/lib/carousel/schema";

/**
 * AI visuals for a whole carousel, generated as one series.
 *
 * The cover goes first. Every other image is then generated with the cover
 * handed back to the model as a reference for light and colour — without it,
 * each image comes out in its own look however precise the shared style
 * prompt, and the carousel reads as a collection of unrelated pictures.
 */

type Series = Pick<CarouselState, "template" | "format" | "visualMotif"> & { visualStyle: VisualStyle; imageModel?: ImageModelChoice };

/** Image model test (admin only): Pro everywhere, Nano Banana 2 everywhere, or Pro for the cover and Nano Banana 2 for the rest. */
export type ImageModelChoice = "pro" | "flash" | "mix";
export function asImageModelChoice(value: unknown): ImageModelChoice {
  return value === "flash" || value === "mix" ? value : "pro";
}
/** The model that draws this slide — the cover decides the scroll, so "mix" keeps it on Pro. */
export function modelFor(kind: CarouselSlide["kind"], choice: ImageModelChoice = "pro"): ImageModel {
  if (choice === "mix") return kind === "cover" ? "pro" : "flash";
  return choice;
}

/** The scene to depict: the AI-written brief, or for older carousels without one, the stock search words, then the title. */
function sceneOf(slide: CarouselSlide): string {
  return slide.imagePrompt.trim() || slide.imageQuery.trim() || slide.title;
}

export function promptFor(slide: CarouselSlide, series: Series, sceneOverride?: string) {
  const layout = imageLayout(slide.kind, series.template);
  const scene = sceneOverride?.trim() || sceneOf(slide);
  return {
    prompt: composeImagePrompt({ scene, motif: series.visualMotif, style: series.visualStyle, layout }),
    aspectRatio: imageAspect(layout, series.format),
    scene,
    layout,
  };
}

/** What the slide says — what its image must make visible, for the image check. */
export function intentOf(slide: CarouselSlide): string {
  return [slide.title, slide.body].map((t) => t.trim()).filter(Boolean).join(" — ");
}

/**
 * One slide's image, checked and corrected once if needed (lib/ai/checked-image).
 * `deadline` is when the calling request must be done by.
 */
export async function generateSlideImage(slide: CarouselSlide, series: Series, opts: { reference: GeneratedImage | null; deadline: number; sceneOverride?: string; timeoutMs?: number }): Promise<GeneratedImage> {
  const { prompt, aspectRatio, scene, layout } = promptFor(slide, series, opts.sceneOverride);
  const result = await generateCheckedImage({
    prompt,
    aspectRatio,
    scene,
    layout,
    reference: opts.reference,
    model: modelFor(slide.kind, series.imageModel),
    timeoutMs: opts.timeoutMs,
    intent: intentOf(slide),
    recompose: (corrected) => composeImagePrompt({ scene: corrected, motif: series.visualMotif, style: series.visualStyle, layout }),
    deadline: opts.deadline,
  });
  if (result.outcome !== "pass" && result.outcome !== "unchecked") console.log(`[carousel-image] slide ${slide.id}: ${result.outcome} — ${result.problems.join("; ")}`);
  return result.image;
}

/** The series' style reference: the cover's image, when it is an AI image in the same style. */
export async function coverReference(slides: CarouselSlide[], style: VisualStyle, userId?: string): Promise<GeneratedImage | null> {
  const cover = slides.find((s) => s.kind === "cover");
  if (!cover?.image || cover.image.source !== aiSource(style)) return null;
  return readOwnImage(cover.image.url, userId);
}

/** A server action here may run 180 s (studio carousel page): the series is done by 170 s. */
export const SERIES_BUDGET_MS = 170_000;
/** What the slides after the cover need at least: one image (~40 s worst typical) plus a check. */
const REST_MS = 70_000;

export interface VisualOutcome {
  slideId: string;
  image?: { url: string; source: string };
  error?: string;
}

async function one(userId: string, slide: CarouselSlide, series: Series, reference: GeneratedImage | null, timeoutMs: number, deadline: number): Promise<{ outcome: VisualOutcome; bytes?: GeneratedImage }> {
  try {
    const bytes = await generateSlideImage(slide, series, { reference, deadline, timeoutMs });
    const url = await storeGeneratedImage(userId, bytes);
    return { outcome: { slideId: slide.id, image: { url, source: aiSource(series.visualStyle) } }, bytes };
  } catch (err) {
    return { outcome: { slideId: slide.id, error: err instanceof AiImageError || err instanceof Error ? err.message : "Échec de la génération." } };
  }
}

/**
 * Generate the visuals of `targets`, cover first. Never throws: each slide
 * reports its own outcome, so the caller refunds exactly the images that
 * failed and keeps the ones that worked.
 *
 * Timeouts are sized so the cover plus the parallel rest stay inside one
 * server action's time budget; `deadline` is that budget's end, which the
 * image checks and corrections respect too. The cover's check runs before
 * the rest start, so a corrected cover is the reference they follow — but
 * only when enough time is left for the rest to be drawn after it.
 */
export async function generateSeries(userId: string, slides: CarouselSlide[], targets: CarouselSlide[], series: Series, deadline = Date.now() + SERIES_BUDGET_MS): Promise<VisualOutcome[]> {
  const cover = targets.find((s) => s.kind === "cover");
  const rest = targets.filter((s) => s.kind !== "cover");
  const outcomes: VisualOutcome[] = [];

  let reference: GeneratedImage | null = null;
  if (cover) {
    // The rest still need ~70 s after the cover, checks included, so the cover's own check stops in time for them.
    const first = await one(userId, cover, series, null, 55_000, rest.length ? deadline - REST_MS : deadline);
    outcomes.push(first.outcome);
    reference = first.bytes ?? null;
  } else {
    reference = await coverReference(slides, series.visualStyle, userId);
  }

  const results = await Promise.all(rest.map((s) => one(userId, s, series, reference, 65_000, deadline)));
  outcomes.push(...results.map((r) => r.outcome));
  return outcomes;
}
