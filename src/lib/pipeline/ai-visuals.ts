import { nanoid } from "nanoid";
import type { AspectRatio } from "@prisma/client";
import { AiImageError, type GeneratedImage } from "@/lib/ai/image-generator";
import { generateCheckedImage } from "@/lib/ai/checked-image";
import { aiSource, composeImagePrompt, type VisualStyle } from "@/lib/carousel/art-direction";
import { storeGeneratedImage, readOwnImage } from "@/lib/ai/images";
import type { VisualLayer } from "@/lib/validations";

/**
 * AI visuals for a video's scenes, generated as one series — the video
 * counterpart of the carousel's `ai-visuals.ts`, reusing its art-direction
 * presets and the same cover-reference technique: scene 0 plays the cover's
 * role, generated first (or read back if it already exists in this style),
 * and handed to every other scene as a reference for light and colour, so
 * the video reads as one continuous shoot instead of stock clips from
 * unrelated sources.
 */

/** Gemini's aspect ratio for a project's frame — a video visual is always full-bleed background, so this is the whole layout decision. */
export function videoAspect(aspectRatio: AspectRatio): "9:16" | "1:1" | "16:9" {
  return aspectRatio === "VERTICAL" ? "9:16" : aspectRatio === "SQUARE" ? "1:1" : "16:9";
}

export interface SceneTarget {
  index: number;
  startMs: number;
  endMs: number;
  /** The AI-written scene description — the substance of the prompt, before the art direction and motif are added. */
  description: string;
  /** What the scene says (its narration) — what the image must make visible, for the image check. */
  intent: string;
}

export interface SceneVisualOutcome {
  index: number;
  layer?: VisualLayer;
  error?: string;
}

/** The series' style reference: scene 0's own visual, when it is already an AI image in this style. */
export async function existingSceneReference(layers: VisualLayer[], style: VisualStyle, userId?: string): Promise<GeneratedImage | null> {
  const first = layers.find((l) => l.sceneIndex === 0);
  if (!first?.src || first.source !== aiSource(style)) return null;
  return readOwnImage(first.src, userId);
}

async function one(
  userId: string,
  target: SceneTarget,
  style: VisualStyle,
  motif: string,
  aspectRatio: "9:16" | "1:1" | "16:9",
  reference: GeneratedImage | null,
  timeoutMs: number,
  deadline: number,
): Promise<{ outcome: SceneVisualOutcome; bytes?: GeneratedImage }> {
  try {
    // "frame": captions can land anywhere over a video scene, not a fixed text
    // band, so nothing is reserved the way the carousel's "bleed" leaves room
    // for a headline — the photo fills the whole frame.
    const compose = (scene: string) => composeImagePrompt({ scene, motif, style, layout: "frame", purpose: "video" });
    const result = await generateCheckedImage({
      prompt: compose(target.description),
      aspectRatio,
      reference,
      timeoutMs,
      intent: target.intent || target.description,
      scene: target.description,
      layout: "frame",
      recompose: compose,
      deadline,
    });
    if (result.outcome !== "pass" && result.outcome !== "unchecked") console.log(`[video-image] scene ${target.index}: ${result.outcome} — ${result.problems.join("; ")}`);
    const bytes = result.image;
    const url = await storeGeneratedImage(userId, bytes, "video");
    const layer: VisualLayer = { id: nanoid(8), type: "image", src: url, startMs: target.startMs, endMs: target.endMs, fit: "cover", kenBurns: "in", opacity: 1, sceneIndex: target.index, source: aiSource(style) };
    return { outcome: { index: target.index, layer }, bytes };
  } catch (err) {
    return { outcome: { index: target.index, error: err instanceof AiImageError || err instanceof Error ? err.message : "Échec de la génération." } };
  }
}

/**
 * Generate the visuals of `targets`. Never throws: each scene reports its own
 * outcome, so the caller refunds exactly the images that failed and keeps
 * the ones that worked.
 *
 * `existingReference` is scene 0's current image, used when scene 0 is not
 * itself among `targets` (e.g. only the scenes missing a visual are being
 * filled, and scene 0 already has one). When scene 0 is a target, it is
 * always generated fresh, exactly like the carousel's cover.
 */
export async function generateSceneVisuals(
  userId: string,
  targets: SceneTarget[],
  style: VisualStyle,
  motif: string,
  aspectRatio: "9:16" | "1:1" | "16:9",
  existingReference: GeneratedImage | null,
  // A studio server action may run 180 s; the scenes are done by 170 s, checks and corrections included.
  deadline = Date.now() + 170_000,
): Promise<SceneVisualOutcome[]> {
  if (!targets.length) return [];
  const first = targets.find((t) => t.index === 0);
  const rest = targets.filter((t) => t !== first);
  const outcomes: SceneVisualOutcome[] = [];

  let reference = existingReference;
  if (first) {
    // The other scenes still need ~70 s after the first, so its own check stops in time for them.
    const firstResult = await one(userId, first, style, motif, aspectRatio, null, 55_000, rest.length ? deadline - 70_000 : deadline);
    outcomes.push(firstResult.outcome);
    reference = firstResult.bytes ?? null;
  }

  const restResults = await Promise.all(rest.map((t) => one(userId, t, style, motif, aspectRatio, reference, 65_000, deadline)));
  outcomes.push(...restResults.map((r) => r.outcome));
  return outcomes;
}
