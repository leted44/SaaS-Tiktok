import { AiImageError, type GeneratedImage, type ImageModel } from "@/lib/ai/image-generator";
import { isGptModel } from "@/lib/ai/gpt-image";
import { generateCheckedImage } from "@/lib/ai/checked-image";
import { DEFAULT_IMAGE_MODEL, modelForImage, type ImageModelChoice } from "@/lib/ai/image-models";
import { aiSource, composeImagePrompt, type VisualStyle } from "@/lib/carousel/art-direction";
import { readOwnImage, storeGeneratedImage } from "@/lib/ai/images";
import { imageAspect, imageLayout, imageSceneOf, type CarouselSlide, type CarouselState } from "@/lib/carousel/schema";

/**
 * AI visuals for a whole carousel, generated as one series.
 *
 * The cover goes first. Every other image is then generated with the cover
 * handed back to the model as a reference for light and colour — without it,
 * each image comes out in its own look however precise the shared style
 * prompt, and the carousel reads as a collection of unrelated pictures.
 */

type Series = Pick<CarouselState, "template" | "format" | "visualMotif"> & {
  visualStyle: VisualStyle;
  imageModel?: ImageModelChoice;
  /** The account's character sheet (lib/characters), sent with every slide. */
  cast?: GeneratedImage | null;
};

export { asImageModelChoice, type ImageModelChoice } from "@/lib/ai/image-models";
/** The model that draws this slide — the cover sets the series, so "mix" keeps it on Pro. */
export function modelFor(kind: CarouselSlide["kind"], choice: ImageModelChoice = DEFAULT_IMAGE_MODEL): ImageModel {
  return modelForImage(kind === "cover", choice);
}

export function promptFor(slide: CarouselSlide, series: Series, sceneOverride?: string) {
  const layout = imageLayout(slide.kind, series.template);
  const scene = sceneOverride?.trim() || imageSceneOf(slide);
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
export async function generateSlideImage(slide: CarouselSlide, series: Series, opts: { reference: GeneratedImage | null; deadline: number; sceneOverride?: string; timeoutMs?: number }): Promise<{ image: GeneratedImage; draft: GeneratedImage | null }> {
  const { prompt, aspectRatio, scene, layout } = promptFor(slide, series, opts.sceneOverride);
  const result = await generateCheckedImage({
    prompt,
    aspectRatio,
    scene,
    layout,
    reference: opts.reference,
    cast: series.cast,
    model: modelFor(slide.kind, series.imageModel),
    timeoutMs: opts.timeoutMs,
    intent: intentOf(slide),
    recompose: (corrected) => composeImagePrompt({ scene: corrected, motif: series.visualMotif, style: series.visualStyle, layout }),
    deadline: opts.deadline,
  });
  if (result.outcome !== "pass" && result.outcome !== "unchecked") console.log(`[carousel-image] slide ${slide.id}: ${result.outcome} — ${result.problems.join("; ")}`);
  return { image: result.image, draft: result.draft };
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
  /** The first drawing, kept in storage when an automatic correction replaced it. */
  draft?: { url: string; source: string };
  error?: string;
}

async function one(userId: string, slide: CarouselSlide, series: Series, reference: GeneratedImage | null, timeoutMs: number, deadline: number): Promise<{ outcome: VisualOutcome; bytes?: GeneratedImage }> {
  try {
    const { image: bytes, draft } = await generateSlideImage(slide, series, { reference, deadline, timeoutMs });
    const url = await storeGeneratedImage(userId, bytes);
    const draftUrl = draft ? await storeGeneratedImage(userId, draft).catch(() => null) : null;
    const source = aiSource(series.visualStyle);
    return { outcome: { slideId: slide.id, image: { url, source }, ...(draftUrl ? { draft: { url: draftUrl, source } } : {}) }, bytes };
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
  // GPT Image takes up to ~100 s an image: cover first, then the rest, would not fit one
  // request. All at once, each with the whole budget, following the existing cover if any.
  if (isGptModel(modelFor("cover", series.imageModel))) {
    const reference = await coverReference(slides, series.visualStyle, userId);
    const all = await Promise.all(targets.map((s) => one(userId, s, series, s.kind === "cover" ? null : reference, 150_000, deadline)));
    return all.map((r) => r.outcome);
  }
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
