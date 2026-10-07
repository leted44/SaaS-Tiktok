import { ART_DIRECTIONS, type VisualStyle } from "@/lib/carousel/art-direction";
import { FORMAT_SIZE, imageSceneOf, type CarouselFormat, type CarouselSlide } from "@/lib/carousel/schema";
import type { ImageAspect } from "@/lib/ai/image-types";

/**
 * Admin test: a carousel slide drawn whole by GPT Image — the picture AND its
 * text, laid out together the way a designer would, the way the owner's
 * ChatGPT carousel was made. Our templates print text over a picture; here
 * the image model sets the type itself, which reads like an ad campaign but
 * cannot be edited afterwards: a changed word means a redrawn slide.
 *
 * The prompt follows the owner's ChatGPT one: the scene, the series' world
 * and look, then the exact French text in order of importance, where it goes,
 * and a closing list of what must not appear.
 */

export function bakedAspect(format: CarouselFormat): ImageAspect {
  return FORMAT_SIZE[format].label as ImageAspect;
}

const quote = (text: string) => `"${text.replace(/"/g, "'").trim()}"`;

export function bakedSlidePrompt(
  slide: CarouselSlide,
  ctx: { cover: CarouselSlide | undefined; motif: string; style: VisualStyle; format: CarouselFormat; accent: string; index: number; total: number; hasReference: boolean },
): string {
  const { width, height, label } = FORMAT_SIZE[ctx.format];
  const story = ctx.format === "story";
  const coverScene = ctx.cover ? imageSceneOf(ctx.cover) : "";
  const scene =
    slide.kind === "cta"
      ? `${coverScene || slide.title}. The final slide: the same subject as the rest of the carousel, shown once more in a warm, satisfying, inviting composition.`
      : imageSceneOf(slide);
  const accentWords = slide.emphasis.trim() ? ` The words ${quote(slide.emphasis)} are set in a warm accent colour close to ${ctx.accent}; the rest of the text is warm ivory white.` : " The text is warm ivory white.";

  const lines: string[] = [];
  if (slide.kind === "cover" && slide.kicker.trim()) lines.push(`${quote(slide.kicker)} — a small label in capitals above the headline.`);
  lines.push(`${quote(slide.title)} — the largest and most visually dominant text, bold modern sans-serif.`);
  if (slide.body.trim()) lines.push(`${quote(slide.body)} — clearly smaller, regular weight, easy to read.`);
  if (slide.kind === "cta") {
    if (slide.action.trim() || slide.shareTo.trim()) lines.push("a thin elegant divider line.");
    if (slide.action.trim()) lines.push(`${quote(slide.action)} — bold capitals, small.`);
    if (slide.shareTo.trim()) lines.push(`${quote(slide.shareTo)} — bold and memorable, the second most visible line.`);
  }

  return [
    `Create a premium ${ctx.format === "square" ? "Instagram" : "Instagram and TikTok"} carousel slide, ${label} frame, ${width}x${height}. Slide ${ctx.index + 1} of ${ctx.total}.`,
    `Image: ${scene.replace(/[.\s]+$/, "")}.`,
    ctx.motif.trim() ? `Recurring cast and world of the series, identical on every slide: ${ctx.motif.trim().replace(/[.\s]+$/, "")}.` : null,
    `Art direction: ${ART_DIRECTIONS[ctx.style].prompt}`,
    ctx.hasReference ? "Match the attached series image's look and, when it has text, its typography — same typefaces, colours and text treatment — so the slides read as one carousel." : null,
    `Add this exact French text directly into the image, in this order:\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`,
    `Typography: premium modern sans-serif, excellent hierarchy and generous spacing, perfectly legible on a phone.${accentWords}`,
    `Layout: the text sits in the ${slide.kind === "content" ? "upper" : "upper and middle"} part of the frame over a calm, darker area of the picture; the subject is in the ${slide.kind === "content" ? "middle and lower" : "lower"} part, fully visible and uncut. Margins of at least 7% on every side.${story ? " Keep the bottom 18% of the frame free of any text: the app's buttons cover it." : ""}`,
    "Perfect French spelling, accents and punctuation, exactly as written above. No other text of any kind: no logo, no watermark, no page number, no username, no captions.",
    "Premium social media campaign: elegant, cinematic, highly shareable.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
