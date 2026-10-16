import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { env } from "@/lib/env";
import type { GeneratedImage } from "@/lib/ai/image-generator";

/**
 * The shot list of a « Film en une fois » (lib/video-clips/film), written for
 * Kling 3's multi-shot generation: one prompt per shot, the characters named
 * by their @ElementN token so Kling draws each from its reference image. The
 * writer sees the start image and every element, reads each shot's brief and
 * on-screen words, and describes action, expression, framing and one camera
 * move. One Claude call, a few cents, next to a 1.7 $ film.
 */

const SYSTEM = `You write the shot list of a multi-shot image-to-video generation (Kling 3) that turns a short silent animated story into ONE continuous vertical clip for TikTok / Instagram Reels.

You see the start image (the first frame of shot 1) and the reference image of each recurring character, called an element: the first reference image is @Element1, the second @Element2, and so on. One reference image may show several characters; then say which one you mean right after the token (e.g. "@Element1 (the little girl)").

For each shot you get the words shown on screen, the scene's visual brief and its length. Write one prompt per shot, in English, 25 to 70 words, present tense:
- Who is in the shot, each character always by its @ElementN token, and only the characters the brief names.
- One clear action at its peak, with a strong readable expression (annoyed, delighted, jealous, surprised), suited to the shot's length — no more action than fits.
- The framing (close-up, medium shot, wide shot) and one simple camera move (slow push-in, gentle pan, static).
- The same home, light and art style as the start image unless the brief moves to another place.
Never write text, captions, logos or speech bubbles into a shot. Never describe image quality.

Answer with JSON only: {"shots": ["prompt of shot 1", "prompt of shot 2", ...]} — exactly one string per shot, in order.`;

export interface FilmShotInput {
  /** The words shown on screen over the shot. */
  caption: string;
  /** The scene's visual brief from the script. */
  brief: string;
  durationSec: number;
}

let client: Anthropic | null = null;

const small = async (image: GeneratedImage) => (await sharp(image.data).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()).toString("base64");

/** One prompt per shot, or null when they could not be written — the caller then sends the briefs as they are. */
export async function writeFilmShots(start: GeneratedImage, elements: GeneratedImage[], shots: FilmShotInput[], motif: string): Promise<string[] | null> {
  if (!env.anthropicApiKey) return null;
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1, timeout: 90_000 });
  try {
    const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: "Start image (first frame of shot 1):" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await small(start) } }];
    for (const [i, el] of elements.entries()) {
      content.push({ type: "text", text: `@Element${i + 1}:` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await small(el) } });
    }
    const list = shots.map((s, i) => `Shot ${i + 1} (${s.durationSec} s)\nOn screen: ${s.caption.trim() || "(none)"}\nBrief: ${s.brief.trim() || "(none)"}`).join("\n\n");
    content.push({ type: "text", text: `${motif.trim() ? `Recurring world of the series: ${motif.trim()}\n\n` : ""}${list}\n\nWrite the ${shots.length} shot prompts.` });
    const response = await client.messages.create({ model: env.anthropicModel, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content }] });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { shots?: unknown };
    const out = Array.isArray(json.shots) ? json.shots.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, 2000)) : [];
    return out.length === shots.length ? out : null;
  } catch (err) {
    console.error("[film-prompt] could not write the shot list:", err instanceof Error ? err.message : err);
    return null;
  }
}
