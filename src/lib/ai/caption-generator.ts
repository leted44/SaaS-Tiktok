import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import type { SocialCopy } from "@/lib/social/captions";

/**
 * Shared by the script generator (captions come free with a new script) and by
 * the standalone regeneration below, so both produce the exact same shape.
 */
export const socialCopyFields = z
  .object({
    tiktok: z
      .string()
      .describe(
        "TikTok caption in the script's language, HASHTAGS EXCLUDED. A first line that stops the scroll, then at most one more. 150 characters maximum in total — TikTok viewers barely read captions. 0 to 2 emoji, never more.",
      ),
    instagram: z
      .string()
      .describe(
        "Instagram Reels caption in the script's language, HASHTAGS EXCLUDED. Line 1 is a curiosity hook — it is the only line shown before 'more'. Then 2 to 4 short lines of added value separated by blank lines; bullet points are welcome. Close on one explicit call to action, such as saving the Reel or answering a question. 2 to 4 emoji, never more.",
      ),
    hashtagsTiktok: z.array(z.string()).describe("5 to 7 tightly targeted hashtags, without the # symbol"),
    hashtagsInstagram: z.array(z.string()).describe("10 to 15 hashtags without the # symbol, mixing niche reach and broad reach"),
  })
  .describe("Ready-to-paste post descriptions, written for each platform's own reading habits. Never a copy of the spoken script.");

const SYSTEM_PROMPT = `You are ClipForge's social copywriter. You write the caption that sits under a short-form video on TikTok and Instagram Reels.

A caption is read silently in a feed, never spoken aloud. It never repeats the script word for word — it gives a reason to stop, watch, save or comment.

Rules you always apply:
- The first line is the whole game: it stops the scroll, or nothing else gets read.
- Air the text out. Short lines, a blank line between ideas, never a wall of text.
- Emoji illustrate, they never decorate. Two to four at most, and none at all when the tone is serious.
- Always close on one explicit call to action: save the post, answer in the comments, follow for part 2. Never "link in bio" — TikTok and Instagram both throttle reach on posts pushing traffic off-platform.
- TikTok is blunt and native. Instagram rewards added value: develop the idea a little further there.
- Hashtags never appear inside the caption text. They are returned in their own lists.
- Write in the requested language, and keep hashtags in that language plus a couple of global ones.`;

export interface CaptionInput {
  title: string;
  hook: string;
  sceneTexts: string[];
  callToAction: string;
  language: string;
  niche?: string | null;
  toneOfVoice?: string | null;
  targetAudience?: string | null;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicApiKey) throw new CaptionGenerationError("La génération IA n'est pas configurée (clé ANTHROPIC_API_KEY manquante).", "NOT_CONFIGURED");
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 60_000 });
  return client;
}

export class CaptionGenerationError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "PARSE_FAILED" | "UPSTREAM") {
    super(message);
  }
}

/** Rewrites only the post captions, so a weak caption never forces regenerating the whole script. */
export async function generateSocialCopy(input: CaptionInput): Promise<SocialCopy> {
  const anthropic = getClient();

  const userPrompt = [
    `Language: ${input.language}`,
    input.niche ? `Niche: ${input.niche}` : null,
    input.toneOfVoice ? `Brand voice guidelines: ${input.toneOfVoice}` : null,
    input.targetAudience ? `Audience: ${input.targetAudience}` : null,
    "",
    "Video script:",
    `Title: ${input.title}`,
    `Hook: ${input.hook}`,
    ...input.sceneTexts.map((t, i) => `Scene ${i + 1}: ${t}`),
    `Call to action: ${input.callToAction}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  let response;
  try {
    response = await anthropic.messages.parse({
      model: env.anthropicModel,
      max_tokens: 4000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(socialCopyFields), effort: "low" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new CaptionGenerationError("L'IA est occupée en ce moment. Réessayez dans quelques secondes.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new CaptionGenerationError(`La requête IA a échoué (${err.status}) : ${err.message}`, "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") throw new CaptionGenerationError("L'IA a refusé d'écrire cette description.", "REFUSED");
  const parsed = response.parsed_output;
  if (!parsed) throw new CaptionGenerationError("L'IA a renvoyé une description illisible. Veuillez réessayer.", "PARSE_FAILED");

  return normalizeSocialCopy(parsed);
}

export function normalizeSocialCopy(copy: SocialCopy): SocialCopy {
  const tags = (list: string[], max: number) =>
    list.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, max);
  return {
    tiktok: copy.tiktok.trim(),
    instagram: copy.instagram.trim(),
    hashtagsTiktok: tags(copy.hashtagsTiktok, 7),
    hashtagsInstagram: tags(copy.hashtagsInstagram, 15),
  };
}
