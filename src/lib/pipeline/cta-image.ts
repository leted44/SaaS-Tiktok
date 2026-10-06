import { nanoid } from "nanoid";
import type { VisualLayer } from "@/lib/validations";

/**
 * The call to action has no image brief of its own — the script writes one per
 * scene, and the CTA would borrow the last scene's (lib/pipeline/visuals), so
 * drawing both paid for two near-identical images. The CTA scene keeps the last
 * scene's picture on screen instead: the same still on a layer of its own, with
 * the CTA's own timing, so the last scene's length (and what animating it costs)
 * is untouched.
 */

/** The composition's CTA scene — its last, when there is a hook, at least one scene and a CTA. */
export function ctaSceneIndex(sceneCount: number): number | null {
  return sceneCount >= 3 ? sceneCount - 1 : null;
}

/** A layer for the CTA scene showing the still of the scene before it; null when that scene has no still (empty, or already animated into a clip). */
export function ctaCopyOf(layers: VisualLayer[], scenes: { startMs: number; endMs: number }[]): VisualLayer | null {
  const cta = ctaSceneIndex(scenes.length);
  if (cta === null) return null;
  const last = layers.find((l) => l.sceneIndex === cta - 1 && l.type === "image" && l.src);
  if (!last) return null;
  return { id: nanoid(8), type: "image", src: last.src, startMs: scenes[cta].startMs, endMs: scenes[cta].endMs, fit: "cover", kenBurns: "in", opacity: 1, sceneIndex: cta, ...(last.source ? { source: last.source } : {}) };
}
