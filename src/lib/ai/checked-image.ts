import { attemptMs, editImage, generateImage, type GeneratedImage, type ImageAspect, type ImageModel } from "@/lib/ai/image-generator";
import { reviewImage } from "@/lib/ai/image-review";
import type { VisualLayout } from "@/lib/carousel/art-direction";

/**
 * Generate an image, check it, and correct it once when the check finds a
 * defect — so what reaches the creator is the corrected image, not a draft
 * they pay to regenerate by hand.
 *
 * At most one correction: an edit when the defect is local, a new image from
 * a corrected scene when the image shows the wrong thing. The correction is
 * on the house — the creator paid for one image and gets one good one. The
 * whole loop respects `deadline`, the moment the calling request must be
 * done by: a check or a correction that could not finish in time is skipped,
 * and the first image is kept, rather than losing everything to a timeout.
 */

/** A check takes ~10-20 s, a correction ~20-40 s. */
const REVIEW_MS = 25_000;
const CORRECTION_MS = 45_000;

export interface CheckedImageInput {
  prompt: string;
  aspectRatio: ImageAspect;
  reference?: GeneratedImage | null;
  /** The account's character sheet, when it has one. */
  cast?: GeneratedImage | null;
  model?: ImageModel;
  timeoutMs?: number;
  /** What the slide or scene says — what the image must make visible. */
  intent: string;
  /** The scene the prompt was composed from, for the reviewer. */
  scene: string;
  layout: VisualLayout;
  /** The full prompt for a new scene, composed the same way as `prompt` (series setting, framing, style). */
  recompose: (scene: string) => string;
  /** Epoch ms by which everything must be finished. */
  deadline: number;
}

export interface CheckedImage {
  image: GeneratedImage;
  /** What happened, for the logs: "pass", "fixed", "redrawn", "unchecked" or "kept". */
  outcome: "pass" | "fixed" | "redrawn" | "unchecked" | "kept";
  problems: string[];
}

export async function generateCheckedImage(input: CheckedImageInput): Promise<CheckedImage> {
  const timeLeft = () => input.deadline - Date.now();
  const first = await generateImage({ prompt: input.prompt, aspectRatio: input.aspectRatio, reference: input.reference, cast: input.cast, model: input.model, timeoutMs: Math.min(attemptMs(input.model, input.timeoutMs), Math.max(10_000, timeLeft())) });

  if (timeLeft() < REVIEW_MS + CORRECTION_MS) return { image: first, outcome: "unchecked", problems: [] };
  const verdict = await reviewImage({ image: first, intent: input.intent, scene: input.scene, layout: input.layout, reference: input.reference, cast: input.cast });
  if (!verdict) return { image: first, outcome: "unchecked", problems: [] };
  if (verdict.verdict === "pass") return { image: first, outcome: "pass", problems: [] };
  if (timeLeft() < CORRECTION_MS) return { image: first, outcome: "kept", problems: verdict.problems };

  const timeoutMs = Math.min(CORRECTION_MS + 15_000, timeLeft() - 3_000);
  try {
    if (verdict.verdict === "fix") {
      const image = await editImage({ image: first, instruction: verdict.instruction, aspectRatio: input.aspectRatio, model: input.model, timeoutMs });
      return { image, outcome: "fixed", problems: verdict.problems };
    }
    const image = await generateImage({ prompt: input.recompose(verdict.instruction), aspectRatio: input.aspectRatio, reference: input.reference, cast: input.cast, model: input.model, timeoutMs });
    return { image, outcome: "redrawn", problems: verdict.problems };
  } catch (err) {
    console.error("[checked-image] correction failed, keeping the first image:", err instanceof Error ? err.message : err);
    return { image: first, outcome: "kept", problems: verdict.problems };
  }
}
