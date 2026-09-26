import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { IMAGE_SLIDE_LIMITS, SLIDE_LIMITS, imageLayout, stripEmoji, type CarouselSlide, type CarouselTemplate } from "@/lib/carousel/schema";
import { ART_DIRECTIONS, type VisualStyle } from "@/lib/carousel/art-direction";

const EMPHASIS = "The 1 to 3 consecutive words of the title that carry its punch — the surprising number, the key noun, the twist — copied EXACTLY as they appear in the title. They are set in the accent colour.";
const IMAGE_BRIEF = "Brief for an image model, in the script's language, 1 to 2 sentences: the one concrete subject that makes this idea visible (a food, an object, a person doing something, a place), staged within the visualMotif, with its action, setting and framing. No lighting, colour or camera words — the art direction adds them.";

/**
 * Content-slide title/body limits depend on whether their photo will be
 * full-bleed (Immersive: the photo IS the background, no room lost) or a
 * band (every other template: the photo is a box that takes a third of the
 * height). Built per call rather than once at import time so the model is
 * only ever told the limit that actually applies to what it is writing.
 */
function carouselFields(contentLimits: { title: number; body: number }) {
  const bandPhoto = contentLimits.body <= IMAGE_SLIDE_LIMITS.body;
  return z.object({
    visualMotif: z
      .string()
      .describe(
        "In the script's language, one sentence: the recurring setting or prop that makes every image of this carousel read as one series, the way a strong Instagram account repeats one staging and only changes the subject — e.g. 'chaque aliment présenté dans une cuillère en bois rustique, au-dessus d'un verger flou'. Concrete and photographable. No lighting or colour words.",
      ),
    coverKicker: z.string().describe("A 1 to 3 word category label for the topic, e.g. 'Psychologie', 'Nutrition', 'Business'. 32 characters maximum."),
    coverTitle: z
      .string()
      .describe("The cover headline: the single strongest promise or counter-intuitive claim of the idea, written to make someone swipe. 70 characters maximum — short headlines stop the scroll. No question unless it is irresistible."),
    coverEmphasis: z.string().describe(EMPHASIS),
    coverSubtitle: z.string().describe("One short line under the headline that makes the swipe feel worth it, e.g. 'Voici comment.' or the key tension. 110 characters maximum."),
    coverImagePrompt: z.string().describe(`${IMAGE_BRIEF} This is the cover: it must make the promise of the headline visible at a glance.`),
    coverImageQuery: z
      .string()
      .describe("2 to 4 ENGLISH words describing one concrete, photographable scene for a stock-photo search behind the cover — a person, a place or an object, never an abstract idea. Example: 'woman journaling morning light'."),
    slides: z
      .array(
        z.object({
          title: z.string().describe(`One complete, punchy statement carrying the idea of the slide — never a vague label like 'Le problème'. ${contentLimits.title} characters maximum.`),
          emphasis: z.string().describe(EMPHASIS),
          body: z.string().describe(`One or two short sentences that explain, prove or illustrate the title with something concrete. ${contentLimits.body} characters maximum${bandPhoto ? " — a photo shares the slide." : "."}`),
          imagePrompt: z.string().describe(IMAGE_BRIEF),
          imageQuery: z.string().describe("2 to 4 ENGLISH words for a stock photo that illustrates this slide concretely."),
        }),
      )
      .describe("Between 5 and 7 content slides. Each slide carries exactly one idea, and together they build: tension, then mechanism, then what to do."),
    ctaKicker: z.string().describe("A 1 to 3 word label for the closing slide, e.g. 'À toi de jouer', 'En résumé'. 32 characters maximum."),
    ctaTitle: z.string().describe("The closing headline: one concrete takeaway or first action the reader can do today. 70 characters maximum."),
    ctaEmphasis: z.string().describe(EMPHASIS),
    ctaBody: z.string().describe("One short sentence that makes the takeaway stick. 140 characters maximum."),
    ctaAction: z
      .string()
      .describe(
        "The explicit engagement ask, adapted from the script's call to action: invite a comment (ideally with one keyword to type), a share with someone who needs it, or a follow for what comes next. Direct and specific, never 'link in bio'. 90 characters maximum.",
      ),
  });
}

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
- Respect every length limit. A slide that runs long is cut off in the image.

Every cover and content slide carries a full image, so you are also the art director of the series:
- The visualMotif is what makes eight images look like one professional account instead of eight unrelated pictures: one recurring staging (a prop, a surface, a place) in which each slide's subject appears. Pick one that fits the topic and can host every subject.
- Each image brief shows ONE concrete subject that makes that slide's idea visible — never an abstract concept, a chart, a diagram, a screen, a document, or anything carrying written words, numbers or a clock face.
- When a slide is about a food, an object or a gesture, stage that thing within the motif. When a person helps, show them in a natural, flattering, fully clothed situation, never a close-up of hands.
- Every image must match the tone of the account: a health topic never shows anything unappetising, gory or embarrassing.`;

export interface CarouselInput {
  title: string;
  hook: string;
  sceneTexts: string[];
  callToAction: string;
  language: string;
  niche?: string | null;
  toneOfVoice?: string | null;
  targetAudience?: string | null;
  /** The look the images will be generated in — the briefs are written to suit it (an illustration can show characters a photo shouldn't). */
  visualStyle: VisualStyle;
  /** Decides how much room a content slide's text gets: full-bleed (Immersive) leaves it untouched, a band leaves a third of the height to a photo. */
  template: CarouselTemplate;
}

export interface GeneratedCarousel {
  slides: CarouselSlide[];
  visualMotif: string;
}

/** The emphasis as it is spelled in the title, or nothing when the model's pick is not actually in it. */
export function emphasisIn(title: string, emphasis: string): string {
  const wanted = stripEmoji(emphasis).trim();
  if (!wanted) return "";
  const at = title.toLowerCase().indexOf(wanted.toLowerCase());
  return at < 0 ? "" : title.slice(at, at + wanted.length);
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

export async function generateCarousel(input: CarouselInput): Promise<GeneratedCarousel> {
  const anthropic = getClient();
  const art = ART_DIRECTIONS[input.visualStyle];
  const contentLimits = imageLayout("content", input.template) === "band" ? IMAGE_SLIDE_LIMITS : SLIDE_LIMITS.content;

  const userPrompt = [
    `Language: ${input.language}`,
    `Art direction of the images: ${art.label} — ${art.prompt}`,
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
      output_config: { format: zodOutputFormat(carouselFields(contentLimits)), effort: "medium" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new CarouselGenerationError("L'IA est occupée en ce moment. Réessayez dans quelques secondes.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new CarouselGenerationError(err.status ? `La requête IA a échoué (${err.status}) : ${err.message}` : `L'IA est injoignable pour le moment (${err.message}).`, "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") throw new CarouselGenerationError("L'IA a refusé d'écrire ce carrousel.", "REFUSED");
  const out = response.parsed_output;
  if (!out || out.slides.length === 0) throw new CarouselGenerationError("L'IA a renvoyé un carrousel illisible. Veuillez réessayer.", "PARSE_FAILED");

  const L = SLIDE_LIMITS;
  const none = { action: "", image: null };
  const brief = (text: string) => stripEmoji(text).replace(/\s+/g, " ").trim().slice(0, 600);
  const coverTitle = fit(out.coverTitle, L.cover.title);
  const ctaTitle = fit(out.ctaTitle, L.cta.title);
  const slides: CarouselSlide[] = [
    {
      ...none,
      id: nanoid(8),
      kind: "cover",
      kicker: fit(out.coverKicker, L.cover.kicker),
      title: coverTitle,
      emphasis: emphasisIn(coverTitle, out.coverEmphasis),
      body: fit(out.coverSubtitle, L.cover.body),
      imageQuery: fit(out.coverImageQuery, 80),
      imagePrompt: brief(out.coverImagePrompt),
    },
    ...out.slides.slice(0, 8).map((s) => {
      // Written for a slide that carries a photo, so held to whatever room that photo actually leaves.
      const title = fit(s.title, contentLimits.title);
      return {
        ...none,
        id: nanoid(8),
        kind: "content" as const,
        kicker: "",
        title,
        emphasis: emphasisIn(title, s.emphasis),
        body: fit(s.body, contentLimits.body),
        imageQuery: fit(s.imageQuery, 80),
        imagePrompt: brief(s.imagePrompt),
      };
    }),
    {
      id: nanoid(8),
      kind: "cta",
      kicker: fit(out.ctaKicker, L.cta.kicker),
      title: ctaTitle,
      emphasis: emphasisIn(ctaTitle, out.ctaEmphasis),
      body: fit(out.ctaBody, L.cta.body),
      action: fit(out.ctaAction, L.cta.action),
      imageQuery: "",
      imagePrompt: "",
      image: null,
    },
  ];
  return { slides, visualMotif: brief(out.visualMotif).slice(0, 300) };
}
