import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { SLIDE_LIMITS, stripEmoji, type CarouselSlide } from "@/lib/carousel/schema";

export const carouselFields = z.object({
  coverKicker: z.string().describe("A 1 to 3 word category label for the topic, e.g. 'Psychologie', 'Nutrition', 'Business'. 32 characters maximum."),
  coverTitle: z
    .string()
    .describe("The cover headline: the single strongest promise or counter-intuitive claim of the idea, written to make someone swipe. 90 characters maximum. No question unless it is irresistible."),
  coverSubtitle: z.string().describe("One short line under the headline that makes the swipe feel worth it, e.g. 'Voici comment.' or the key tension. 140 characters maximum."),
  coverImageQuery: z
    .string()
    .describe("2 to 4 ENGLISH words describing one concrete, photographable scene for a stock-photo search behind the cover — a person, a place or an object, never an abstract idea. Example: 'woman journaling morning light'."),
  slides: z
    .array(
      z.object({
        title: z.string().describe("One complete, punchy statement carrying the idea of the slide — never a vague label like 'Le problème'. 110 characters maximum."),
        body: z.string().describe("One to three short sentences that explain, prove or illustrate the title with something concrete. 320 characters maximum, ideally under 220."),
        imageQuery: z.string().describe("2 to 4 ENGLISH words for a stock photo that illustrates this slide concretely. Used only if the creator decides to add a photo."),
      }),
    )
    .describe("Between 5 and 8 content slides. Each slide carries exactly one idea, and together they build: tension, then mechanism, then what to do."),
  ctaKicker: z.string().describe("A 1 to 3 word label for the closing slide, e.g. 'À toi de jouer', 'En résumé'. 32 characters maximum."),
  ctaTitle: z.string().describe("The closing headline: one concrete takeaway or first action the reader can do today. 70 characters maximum."),
  ctaBody: z.string().describe("One short sentence that makes the takeaway stick. 140 characters maximum."),
  ctaAction: z
    .string()
    .describe(
      "The explicit engagement ask, adapted from the script's call to action: invite a comment (ideally with one keyword to type), a share with someone who needs it, or a follow for what comes next. Direct and specific, never 'link in bio'. 90 characters maximum.",
    ),
});

const SYSTEM_PROMPT = `You write Instagram and TikTok photo carousels for creators. You turn a short-video script into a carousel that is read, slide by slide, in a feed.

A carousel is read, never heard. Spoken lines do not survive on a slide: rewrite everything for the eye — shorter, denser, one idea per slide.

Rules you always apply:
- The cover decides everything. Its headline must stop the scroll on its own, with no image to help it.
- Every content slide title is a full statement that teaches something even if the body is skipped. Never a label, never a teaser.
- Bodies are concrete: a mechanism, a number, an example, a precise action. No filler, no motivational fluff.
- Build a progression across slides: the tension or false belief, then why it happens, then what to do.
- The last slide ends on one explicit ask — comment a keyword, share, or follow — adapted from the script's own call to action. It is the moment the reader decides what to do next: never waste it.
- No emoji anywhere — the slide fonts cannot draw them. No hashtags. No numbering in titles — the design numbers the slides.
- Keep the script's language, its tone, and its way of addressing the reader (tu or vous).
- Respect every length limit. A slide that runs long is cut off in the image.`;

export interface CarouselInput {
  title: string;
  hook: string;
  sceneTexts: string[];
  callToAction: string;
  language: string;
  niche?: string | null;
  toneOfVoice?: string | null;
  targetAudience?: string | null;
}

export class CarouselGenerationError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "PARSE_FAILED" | "UPSTREAM") {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicApiKey) throw new CarouselGenerationError("La génération IA n'est pas configurée (clé ANTHROPIC_API_KEY manquante).", "NOT_CONFIGURED");
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 90_000 });
  return client;
}

/**
 * Cut at a word boundary under `max`.
 *
 * The model is told the limits and nearly always keeps them, but a slide that
 * overflows is cut off in the rendered image — so anything over the limit is
 * trimmed here, at the last full word, rather than trusted.
 */
export function fit(text: string, max: number): string {
  const clean = stripEmoji(text).replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

export async function generateCarousel(input: CarouselInput): Promise<CarouselSlide[]> {
  const anthropic = getClient();

  const userPrompt = [
    `Language: ${input.language}`,
    input.niche ? `Niche: ${input.niche}` : null,
    input.toneOfVoice ? `Brand voice guidelines: ${input.toneOfVoice}` : null,
    input.targetAudience ? `Audience: ${input.targetAudience}` : null,
    "",
    "Video script to turn into a carousel:",
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
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(carouselFields), effort: "medium" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new CarouselGenerationError("L'IA est occupée en ce moment. Réessayez dans quelques secondes.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new CarouselGenerationError(`La requête IA a échoué (${err.status}) : ${err.message}`, "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") throw new CarouselGenerationError("L'IA a refusé d'écrire ce carrousel.", "REFUSED");
  const out = response.parsed_output;
  if (!out || out.slides.length === 0) throw new CarouselGenerationError("L'IA a renvoyé un carrousel illisible. Veuillez réessayer.", "PARSE_FAILED");

  const L = SLIDE_LIMITS;
  const none = { action: "", image: null };
  return [
    { ...none, id: nanoid(8), kind: "cover", kicker: fit(out.coverKicker, L.cover.kicker), title: fit(out.coverTitle, L.cover.title), body: fit(out.coverSubtitle, L.cover.body), imageQuery: fit(out.coverImageQuery, 80) },
    ...out.slides.slice(0, 8).map((s) => ({ ...none, id: nanoid(8), kind: "content" as const, kicker: "", title: fit(s.title, L.content.title), body: fit(s.body, L.content.body), imageQuery: fit(s.imageQuery, 80) })),
    { id: nanoid(8), kind: "cta", kicker: fit(out.ctaKicker, L.cta.kicker), title: fit(out.ctaTitle, L.cta.title), body: fit(out.ctaBody, L.cta.body), action: fit(out.ctaAction, L.cta.action), imageQuery: "", image: null },
  ];
}
