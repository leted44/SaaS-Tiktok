import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { env } from "@/lib/env";
import type { GeneratedImage } from "@/lib/ai/image-generator";

/**
 * The Kling prompt of one scene's animation, written by looking at the image.
 *
 * Kling animates whatever it is told to, and the scene's script brief says
 * what the AI image was *meant* to show — an imported photo, a Gemini image
 * or a swapped stock picture shows something else, and motion described for
 * the wrong picture comes out as morphing. So the writer sees the actual
 * image, hears the line spoken over it, and describes motion for what is
 * there. Nobody types anything: the owner's rule is posting ideas fast, not
 * directing clips. About 3-5 cents, next to a 21-cent clip.
 */

const SYSTEM = `You write the prompt for an image-to-video model (Kling) that animates one still into a short vertical clip for TikTok / Instagram Reels.

You see the still. You are told the line the voice-over speaks while the clip plays, the scene's intent, the series' recurring setting and the clip length.

Write one paragraph in English, 50 to 110 words, present tense, describing only motion:
- The main subject's action: one clear, natural movement that suits the spoken line and what the image already shows (a gesture, a turn of the head, a step, a wave, a smile, hair or fabric moving). Never an action that needs anything not in the image.
- Secondary motion of what is already in the frame (water ripples, particles drifting, cells floating, leaves, light flickering, background people walking).
- One gentle camera move (slow push-in, slight orbit, slow pan, or static) — never shaky, never a cut.
- The subject's identity, face, body proportions, clothing and art style stay exactly as in the image.

Never add people, objects, text, logos or captions that are not in the image. Never describe the image's style or quality — only what moves and how. Output the paragraph alone, no title or quotes.`;

/** Appended to every prompt: what image-to-video gets wrong most, said once. */
export const MOTION_GUARD = "Smooth, natural motion; the subject keeps the same face, body and clothing throughout; no text appears.";

/** Sent as Kling's negative prompt — the usual failures of a still brought to life. */
export const MOTION_NEGATIVE = "blur, distortion, morphing face, extra limbs, extra fingers, melting, flicker, camera shake, sudden cut, text, watermark, low quality";

export interface MotionContext {
  /** What the voice says over the clip. */
  spoken: string;
  /** The scene's visual brief from the script — the intent, not necessarily what the image shows. */
  brief: string;
  /** The series' fil conducteur. */
  motif: string;
  durationSec: number;
}

let client: Anthropic | null = null;

/** The motion prompt for this still, or null when it could not be written — the caller then falls back to the brief. */
export async function writeMotionPrompt(image: GeneratedImage, ctx: MotionContext): Promise<string | null> {
  if (!env.anthropicApiKey) return null;
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1, timeout: 60_000 });
  try {
    const data = await sharp(image.data).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const details = [
      `Spoken line: ${ctx.spoken.trim() || "(none)"}`,
      ctx.brief.trim() && `Scene intent: ${ctx.brief.trim()}`,
      ctx.motif.trim() && `Recurring setting: ${ctx.motif.trim()}`,
      `Clip length: ${ctx.durationSec} seconds`,
    ].filter(Boolean).join("\n");
    const response = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } }, { type: "text", text: details }] }],
    });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").replace(/\s+/g, " ").trim();
    return text ? `${text.slice(0, 1200)} ${MOTION_GUARD}` : null;
  } catch (err) {
    console.error("[motion-prompt] could not write the motion prompt:", err instanceof Error ? err.message : err);
    return null;
  }
}
