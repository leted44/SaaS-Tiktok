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
 * move, every character named once by their own token and place (the first
 * Standard film ended on two dads and no mum). One Claude call, a few cents,
 * next to a 1.7 $ film.
 */

const SYSTEM = `You write the shot list of a multi-shot image-to-video generation (Kling 3) that turns a short silent animated story into ONE continuous vertical clip for TikTok / Instagram Reels.

You see the start image (the first frame of shot 1) and the reference image of each recurring character, called an element: the first reference image is @Element1, the second @Element2, and so on. One reference image may show several characters; then say which one you mean right after the token (e.g. "@Element1 (the little girl)").

You get the story in one line, then for each shot the words shown on screen, the scene's visual brief and its length. Read every shot first: the shots are one gag told in order, each the consequence of the one before.

Write one prompt per shot, in English, 25 to 70 words, present tense:
- Who is in the shot, each character always by its @ElementN token followed by two or three of their fixed traits (hair, outfit as in the start image), and only the characters the brief names.
- Outfits come from the start image: what each character wears there, they wear in every shot (pyjamas in bed stay pyjamas), described in those words. A reference image and the series' recurring world give face, hair and build only — their clothes are another day's and are never written into a shot.
- A reference image shows only what a character looks like. Their pose, gesture and place come from the shot alone: never the pose of their reference image — a thumbs-up, a straight standing pose or a front view on a reference image is not an action and is never repeated. A character who arrives is moving (walks in, opens the door and steps through), never posing in a doorway.
- Each character appears ONCE in a shot, never twice. Name every character present by their own token and where they are in the frame (left, right, middle) — never as a group ("the parents", "both of them"), which makes the model draw one character twice and drop the other. A character still in the scene from the previous shot is named again, even when only peeking from the edge of the frame, so nobody vanishes or is replaced by someone else.
- One clear action at its peak that moves the gag forward from the previous shot, with the expression that beat calls for (annoyed, delighted, jealous, surprised) — a character who refuses or sulks keeps refusing or sulking until the story turns, never smiling in between. Suited to the shot's length: no more action than fits.
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
export async function writeFilmShots(start: GeneratedImage, elements: GeneratedImage[], shots: FilmShotInput[], motif: string, story: string): Promise<string[] | null> {
  if (!env.anthropicApiKey) return null;
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1, timeout: 90_000 });
  try {
    const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: "Start image (first frame of shot 1):" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await small(start) } }];
    for (const [i, el] of elements.entries()) {
      content.push({ type: "text", text: `@Element${i + 1}:` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await small(el) } });
    }
    const list = shots.map((s, i) => `Shot ${i + 1} (${s.durationSec} s)\nOn screen: ${s.caption.trim() || "(none)"}\nBrief: ${s.brief.trim() || "(none)"}`).join("\n\n");
    content.push({ type: "text", text: `${story.trim() ? `The story: ${story.trim()}\n\n` : ""}${motif.trim() ? `Recurring world of the series (places and mood; the outfits are the start image's): ${motif.trim()}\n\n` : ""}${list}\n\nWrite the ${shots.length} shot prompts.` });
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
