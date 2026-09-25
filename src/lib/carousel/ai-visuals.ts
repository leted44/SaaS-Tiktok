import { generateImage, AiImageError, type GeneratedImage } from "@/lib/ai/image-generator";
import { aiSource, composeImagePrompt, type VisualStyle } from "@/lib/carousel/art-direction";
import { readOwnImage, storeGeneratedImage } from "@/lib/carousel/images";
import { imageAspect, imageLayout, type CarouselSlide, type CarouselState } from "@/lib/carousel/schema";

/**
 * AI visuals for a whole carousel, generated as one series.
 *
 * The cover goes first. Every other image is then generated with the cover
 * handed back to the model as a reference for light and colour — without it,
 * each image comes out in its own look however precise the shared style
 * prompt, and the carousel reads as a collection of unrelated pictures.
 */

type Series = Pick<CarouselState, "template" | "format" | "visualMotif"> & { visualStyle: VisualStyle };

/** The scene to depict: the AI-written brief, or for older carousels without one, the stock search words, then the title. */
function sceneOf(slide: CarouselSlide): string {
  return slide.imagePrompt.trim() || slide.imageQuery.trim() || slide.title;
}

export function promptFor(slide: CarouselSlide, series: Series, sceneOverride?: string) {
  const layout = imageLayout(slide.kind, series.template);
  return {
    prompt: composeImagePrompt({ scene: sceneOverride?.trim() || sceneOf(slide), motif: series.visualMotif, style: series.visualStyle, layout }),
    aspectRatio: imageAspect(layout, series.format),
  };
}

/** The series' style reference: the cover's image, when it is an AI image in the same style. */
export async function coverReference(slides: CarouselSlide[], style: VisualStyle): Promise<GeneratedImage | null> {
  const cover = slides.find((s) => s.kind === "cover");
  if (!cover?.image || cover.image.source !== aiSource(style)) return null;
  return readOwnImage(cover.image.url);
}

export interface VisualOutcome {
  slideId: string;
  image?: { url: string; source: string };
  error?: string;
}

async function one(userId: string, slide: CarouselSlide, series: Series, reference: GeneratedImage | null, timeoutMs: number): Promise<{ outcome: VisualOutcome; bytes?: GeneratedImage }> {
  try {
    const bytes = await generateImage({ ...promptFor(slide, series), reference, timeoutMs });
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
 * server action's time budget.
 */
export async function generateSeries(userId: string, slides: CarouselSlide[], targets: CarouselSlide[], series: Series): Promise<VisualOutcome[]> {
  const cover = targets.find((s) => s.kind === "cover");
  const rest = targets.filter((s) => s.kind !== "cover");
  const outcomes: VisualOutcome[] = [];

  let reference: GeneratedImage | null = null;
  if (cover) {
    const first = await one(userId, cover, series, null, 25_000);
    outcomes.push(first.outcome);
    reference = first.bytes ?? null;
  } else {
    reference = await coverReference(slides, series.visualStyle);
  }

  const results = await Promise.all(rest.map((s) => one(userId, s, series, reference, 28_000)));
  outcomes.push(...results.map((r) => r.outcome));
  return outcomes;
}
