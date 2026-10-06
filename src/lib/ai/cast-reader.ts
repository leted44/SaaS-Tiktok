import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { env } from "@/lib/env";
import type { GeneratedImage } from "@/lib/ai/image-generator";

/**
 * The character sheet, read once and put into words.
 *
 * The image model gets the sheet itself, but the writers that compose every
 * image brief (script, series, carousel) only read text: without this, they
 * describe the mascot from the Thématique — «gants bleus» where the sheet
 * shows white gloves — and the image model is handed two contradicting
 * descriptions. Read when a sheet is saved, about a cent, never per post.
 */

const SYSTEM = `You describe the characters on a character sheet so that a writer who never sees it describes them exactly as drawn.

For each character, left to right, one line: its kind (e.g. "a red blood cell", "a stomach"), then its body shape, colours, face (eyes, eyebrows, nose, mouth), limbs, hands and feet, clothing and accessories. Concrete visual facts only, in English: no names, no personality, no style or lighting words, nothing about the background. 600 characters at most in total.`;

let client: Anthropic | null = null;

/** The sheet's characters in words, or null when it could not be read — a missing description never blocks anything. */
export async function describeCharacterSheet(image: GeneratedImage): Promise<string | null> {
  if (!env.anthropicApiKey) return null;
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1, timeout: 60_000 });
  try {
    const data = await sharp(image.data).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const response = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } }, { type: "text", text: "Describe the characters on this sheet." }] }],
    });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return text ? text.slice(0, 900) : null;
  } catch (err) {
    console.error("[cast-reader] could not describe the character sheet:", err instanceof Error ? err.message : err);
    return null;
  }
}
