import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import sharp from "sharp";
import { env } from "@/lib/env";
import type { GeneratedImage } from "@/lib/ai/image-generator";
import type { VisualLayout } from "@/lib/carousel/art-direction";

/**
 * A second pair of eyes on every generated image, before anyone sees it.
 *
 * Image models fail in ways a prompt cannot fully rule out: the wrong
 * exercise, the feet cropped out of a slide about keeping them on the floor,
 * a sixth finger, a word scrawled on a wall, a different athlete from one
 * slide to the next. Claude looks at the image next to what the slide says
 * and returns one of three verdicts: keep it, correct one defect by editing
 * the image, or redraw it from a corrected scene.
 */

const SAFE_ZONE: Record<VisualLayout, string> = {
  bleed: "Text is printed over the lower 45% of this image: the subject and the key action must be fully visible in the upper 55%.",
  band: "The image is shown as a wide band: the subject must be fully inside the frame, away from the edges.",
  frame: "The image fills a video frame: the subject must be fully visible and uncut.",
};

const SYSTEM = `You are the photo editor of a premium Instagram and TikTok account. You check one AI-generated image before it is published, against what the post says.

Check, in this order:
1. Meaning: the image shows exactly what the slide text and the scene brief describe — the right action, object or situation, with every element the text relies on visible. A viewer must get it at a glance. For an exercise, the movement must be the named one, performed with correct technique (grip, body line, contact points with the floor or equipment) — unless the text is about a mistake, in which case that exact mistake must be clearly visible and is not a defect — and caught at the moment the text is about — a plain hang does not show a negative, a pull-up does not show a row.
2. Anatomy: natural proportions, two arms, two legs, five fingers per visible hand, joints bending the right way, no fused, missing or extra body parts.
3. Physical coherence: equipment and objects are realistic (a bar is straight and continuous, nothing floats or passes through a body).
4. Text: no letters, numbers, logos or watermarks anywhere. No object taken literally from a figure of speech (a wooden board for "une planche", an arrow for "une flèche") — that is a meaning defect.
5. Framing: the safe-zone rule given with the image is respected.
6. Series: when a reference image is given, the image belongs to the same series (same look) and any recurring person is the same person.

Flag only defects a viewer would notice on a phone. Style preferences are not defects.

Verdict:
- "pass": publishable as is.
- "fix": one or two local defects that an edit of this same image can correct without redrawing it (a hand, an object, a stray letter, a detail of the background). "instruction" is the edit to make, in English, one or two precise sentences naming what to change and how it must look.
- "redo": the image shows the wrong thing, the wrong movement, misses an element the text relies on, breaks the framing rule, or has defects too large to edit. "instruction" is a corrected scene description in English for a new image: subject with a precise appearance, the exact action and pose (body angle, arm, hand, leg and foot positions, contact points), the setting, the shot size and camera angle that keep every needed element in frame. 60 to 120 words, no lighting or colour words.`;

const verdictSchema = z.object({
  verdict: z.enum(["pass", "fix", "redo"]),
  problems: z.array(z.string()).describe("The defects found, in English, one short phrase each. Empty when the verdict is pass."),
  instruction: z.string().describe("For fix: the edit to make. For redo: the corrected scene description. For pass: an empty string."),
});

export type ImageVerdict = z.infer<typeof verdictSchema>;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1, timeout: 45_000 });
  return client;
}

/** Smaller copy for review: Claude scales big images down anyway, so sending them full size only costs time and tokens. */
async function forReview(image: GeneratedImage, maxSide: number): Promise<{ data: string; media_type: "image/jpeg" }> {
  const data = await sharp(image.data).resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { data: data.toString("base64"), media_type: "image/jpeg" };
}

export interface ReviewInput {
  image: GeneratedImage;
  /** What the slide or scene says, in the creator's language — what the image must make visible. */
  intent: string;
  /** The scene brief the image was drawn from. */
  scene: string;
  layout: VisualLayout;
  /** The series' first image, when this one was drawn to match it. */
  reference?: GeneratedImage | null;
}

/** The verdict on one image, or null when no review could be made — a review never blocks an image. */
export async function reviewImage(input: ReviewInput): Promise<ImageVerdict | null> {
  const anthropic = getClient();
  if (!anthropic) return null;
  try {
    const content: Anthropic.ContentBlockParam[] = [];
    if (input.reference) {
      content.push({ type: "text", text: "Reference — the first image of the series:" });
      content.push({ type: "image", source: { type: "base64", ...(await forReview(input.reference, 768)) } });
    }
    content.push({ type: "text", text: "Image to check:" });
    content.push({ type: "image", source: { type: "base64", ...(await forReview(input.image, 1280)) } });
    content.push({
      type: "text",
      text: [`What the post says (the image must show it): «${input.intent.trim()}»`, `Scene brief the image was drawn from: ${input.scene.trim()}`, `Framing rule: ${SAFE_ZONE[input.layout]}`].join("\n"),
    });
    const response = await anthropic.messages.parse({
      model: env.anthropicModel,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(verdictSchema), effort: "medium" },
    });
    if (response.stop_reason === "refusal") return null;
    const verdict = response.parsed_output;
    if (!verdict) return null;
    // A verdict that asks for a change without saying which one cannot be acted on.
    if (verdict.verdict !== "pass" && !verdict.instruction.trim()) return { ...verdict, verdict: "pass" };
    return verdict;
  } catch (err) {
    console.error("[image-review] review failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
