import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { CONTENT_SLIDES, IMAGE_PROMPT_MAX, IMAGE_SLIDE_LIMITS, SLIDE_LIMITS, VISUAL_MOTIF_MAX, imageLayout, stripEmoji, type CarouselLength, type CarouselSlide, type CarouselTemplate } from "@/lib/carousel/schema";
import { anthropicErrorMessage } from "@/lib/ai/anthropic-errors";
import { ART_DIRECTIONS, type VisualLayout, type VisualStyle } from "@/lib/carousel/art-direction";

const EMPHASIS = "The 1 to 3 consecutive words of the title that carry its punch — the surprising number, the key noun, the twist — copied EXACTLY as they appear in the title. They are set in the accent colour.";
/**
 * The brief an image is drawn from, in the order Google recommends for its
 * image models — subject, action, setting, composition — in English, the
 * language their training captions are richest in. A short, metaphor-first
 * brief with no camera words (what this used to ask for) left the model to
 * pick the shot: it cropped out what the slide was about and drew the wrong
 * movement. The art direction (light, colour, lens, grain) is added after.
 */
const FRAMING: Record<VisualLayout, string> = {
  bleed: "every element the slide relies on is visible and uncut in the upper 55% of a vertical frame — text covers the lower part",
  band: "every element the slide relies on is fully inside a wide horizontal frame",
  frame: "every element the scene relies on is fully visible and uncut",
};
function imageBrief(layout: VisualLayout): string {
  return `The brief for the image model, written in ENGLISH, 60 to 120 words of precise, concrete description, in this order: (1) Subject — who or what, with a precise appearance; when the series' recurring person or character appears, describe them exactly as the visualMotif does. (2) Action — precisely what this slide says, shown literally when it is physical: for an exercise, a technique or a posture, the exact mechanics performed with correct form — body angle and line, position of the arms, hands, legs and feet, grip, contact points with the floor or the equipment, the equipment and its height. When the text is about a mistake to avoid, show that exact mistake, clearly visible and unmistakable (e.g. elbows flared at 90°, sagging hips), never the corrected version. When the text corrects a mistake shown just before, show the corrected form from the same camera angle as the mistake, with the corrected detail unmistakably different (e.g. elbows tucked close to the body at about 45°, against elbows flared out wide), so the difference is obvious at a glance. Everywhere else — the hook or cover, a transition, a call to action, a line that only mentions mistakes in general — whatever the subject, the right way is shown, and the brief spells out the details that make it right: for an exercise, each form point and contact point (e.g. for a squat: both heels flat on the floor, knees in line with the toes, chest up, back straight); for a recipe, the correct technique and a result that looks properly done (e.g. pasta drained in a colander, a steak seared brown outside and pink inside); for any other skill or product, the correct grip, gesture, tool or setting. Image models drift toward common faults (lifted heels, fingers in front of a knife blade, food that looks raw), and a viewer would spot the very error the post warns against. Words used figuratively in the text name a position or an idea, never an object to draw: "une planche" is the plank position (body straight like a board), "une flèche, pas un T" is the shape the arms make — show the real position, never a wooden board, an arrow or a letter. The same for any subject: "brûler des calories" shows effort, never fire; "un coup de fouet" shows energy, never a whip; "la clé du succès" shows the result, never a key. A still image shows one instant: for a movement that unfolds over time (a descent, a lift, a jump), pick the single key moment the slide is about — e.g. for a slow negative, the top of the pull-up with the chin above the bar and the elbows fully bent — so the image cannot be mistaken for another exercise. (3) Setting — where. (4) Composition — the shot size (close-up, medium shot, full-body wide shot) and camera angle (side view, three-quarter view, low angle…) chosen so that ${FRAMING[layout]}. Describe what to show, never what to avoid. No lighting, colour or film-look words: the art direction adds them.`;
}

function coverFields(layout: VisualLayout) {
  return {
    coverKicker: z.string().describe("A 1 to 3 word category label for the topic, e.g. 'Psychologie', 'Nutrition', 'Business'. 32 characters maximum."),
    coverTitle: z
      .string()
      .describe("The cover headline: the single strongest promise or counter-intuitive claim of the idea, written to make someone swipe. 70 characters maximum — short headlines stop the scroll. No question unless it is irresistible."),
    coverEmphasis: z.string().describe(EMPHASIS),
    coverSubtitle: z.string().describe("One short line under the headline that makes the swipe feel worth it, e.g. 'Voici comment.' or the key tension. 110 characters maximum."),
    coverImagePrompt: z.string().describe(`${imageBrief(layout)} This is the cover: the most striking image of the series, making the promise of the headline visible at a glance.`),
    coverImageQuery: z
      .string()
      .describe("2 to 4 ENGLISH words describing one concrete, photographable scene for a stock-photo search behind the cover — a person, a place or an object, never an abstract idea. Example: 'woman journaling morning light'."),
  };
}

/** The series bible: one recurring cast described once, and the world the images share. */
const MOTIF =
  "In the script's language, at most 450 characters, two parts. (1) The recurring cast: when a person appears in the series, ONE precise description reused for every image — gender, approximate age, build, skin tone, hair, and outfit with its colours (plain, no logos); otherwise the recurring character or family of objects. (2) The world the images share: the place and its recurring elements, never one identical prop repeated on every slide. No lighting or colour-grading words, nothing about the subject's size or place in the frame — the framing is set separately.";

/** A single-image post: no swipe, no CTA slide — the cover alone has to land the whole idea. */
function singleImageFields(coverLayout: VisualLayout) {
  return z.object({
    visualMotif: z.string().describe(MOTIF),
    ...coverFields(coverLayout),
  });
}

/**
 * Content-slide title/body limits depend on whether their photo will be
 * full-bleed (Immersive: the photo IS the background, no room lost) or a
 * band (every other template: the photo is a box that takes a third of the
 * height). Built per call rather than once at import time so the model is
 * only ever told the limit that actually applies to what it is writing.
 */
function carouselFields(contentLimits: { title: number; body: number }, length: "short" | "full", coverLayout: VisualLayout, contentLayout: VisualLayout) {
  const bandPhoto = contentLimits.body <= IMAGE_SLIDE_LIMITS.body;
  const slideCount = length === "short" ? "Exactly 2 content slides — the single strongest supporting point and the payoff, nothing else." : "Between 5 and 7 content slides. Each slide carries exactly one idea, and together they build: tension, then mechanism, then what to do.";
  return z.object({
    visualMotif: z.string().describe(MOTIF),
    ...coverFields(coverLayout),
    slides: z
      .array(
        z.object({
          title: z.string().describe(`One complete, punchy statement carrying the idea of the slide — never a vague label like 'Le problème'. ${contentLimits.title} characters maximum.`),
          emphasis: z.string().describe(EMPHASIS),
          body: z.string().describe(`One or two short sentences that explain, prove or illustrate the title with something concrete. ${contentLimits.body} characters maximum${bandPhoto ? " — a photo shares the slide." : "."}`),
          imagePrompt: z.string().describe(imageBrief(contentLayout)),
          imageQuery: z.string().describe("2 to 4 ENGLISH words for a stock photo that illustrates this slide concretely."),
        }),
      )
      .describe(slideCount),
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
- Never invent a promise the script does not make — a result in a fixed number of days or weeks, a guaranteed outcome, a health benefit. Bold hooks are welcome; a claim a reader can easily prove false costs the account its credibility.

Every cover and content slide carries a full image, so you are also the art director of the series. The images are what make people stop scrolling and follow the account: aim for the level of the best accounts in the niche, never a stock-photo look.
- Each image is the shot a professional photographer would take for exactly that slide: someone who only looks at the image understands what the slide is about.
- When a slide teaches something physical — an exercise, a technique, a posture, a recipe step, a gesture — the image shows that very thing, literally, done correctly — or, when the slide is about a mistake, that exact mistake made clearly visible — with every element the text relies on in the frame (if the text says the feet stay on the floor, the feet and the floor are visible). Visual metaphors, dramatised scenes and characters are for abstract ideas: psychology, money, biology, habits.
- The visualMotif is the series bible: one recurring cast, described once with precision, and one world. Every brief that shows the recurring person describes them with those same words, so the same person appears on every slide.
- Vary the shots across slides — wide, medium, close-up, different angles — so the series never looks like one image repeated, while the cast and the world stay the same. No content slide reuses the cover's pose and camera angle.
- Fit the scene to the art direction you are given: with Illustration 3D, organs, cells and foods can be expressive characters; with a photographic direction, show real people, real objects and real places.
- Never an abstract concept, a chart, a diagram, a screen, a document, or anything carrying written words, numbers or a clock face.
- People are shown in a natural, flattering, fully clothed situation, with correct anatomy. Characters (organs, cells, foods with faces) are appealing and friendly, never scary.
- Every image matches the tone of the account: a health topic never shows anything unappetising, gory or embarrassing.`;

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
  /** One image, a short 4-slide carousel (cover, 2 content, CTA) or a full one. */
  length: CarouselLength;
  /** The length the script itself was written for, when it was written as a carousel: its scenes are then the slides. */
  scriptLength?: CarouselLength | null;
  /** The cover headline the creator picked — used word for word. */
  coverHeadline?: string | null;
}

const LENGTH_BRIEF: Record<CarouselLength, string> = {
  single:
    "Format: ONE single image post — no swipe, no other slide. The cover alone must deliver the whole idea: the headline is the impactful message itself (a striking fact, a counter-intuitive truth, a clear rule), and the subtitle gives the proof or the one action that makes it useful.",
  short: "Format: a short 4-slide carousel — the cover, exactly 2 content slides, and the closing slide. Keep only the strongest point and its payoff.",
  full: "Format: a full carousel — the cover, 5 to 7 content slides, and the closing slide.",
};

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
    input.niche && input.niche !== "general" ? `Niche: ${input.niche}` : null,
    input.toneOfVoice ? `Brand voice guidelines: ${input.toneOfVoice}` : null,
    input.targetAudience ? `Audience: ${input.targetAudience}` : null,
    "",
    "Video script to turn into a carousel:",
    `Title: ${input.title}`,
    `Hook: ${input.hook}`,
    ...input.sceneTexts.map((t, i) => `Scene ${i + 1}: ${t}`),
    `Call to action: ${input.callToAction}`,
    // A script written for this very carousel already has one idea per slide: the job is fitting it, never re-inventing it.
    input.scriptLength === input.length
      ? "\nThis script was already written for exactly this carousel: its hook is the cover, each scene is one content slide, in this order, and its call to action is the closing ask. Keep every idea, its order and its punch; only fit the wording to the length limits and write the image briefs. Never add, merge or drop an idea."
      : null,
    input.coverHeadline ? `\nThe cover headline is chosen by the creator — use it WORD FOR WORD as coverTitle: «${input.coverHeadline}». Pick coverEmphasis from it, and write the cover image and subtitle to serve it.` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const coverLayout = imageLayout("cover", input.template);
  const contentLayout = imageLayout("content", input.template);
  const format = input.length === "single" ? singleImageFields(coverLayout) : carouselFields(contentLimits, input.length, coverLayout, contentLayout);
  let response;
  try {
    response = await anthropic.messages.parse({
      model: env.anthropicModel,
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${LENGTH_BRIEF[input.length]}\n\n${userPrompt}` }],
      output_config: { format: zodOutputFormat(format), effort: "medium" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new CarouselGenerationError("L'IA est occupée en ce moment. Réessayez dans quelques secondes.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new CarouselGenerationError(anthropicErrorMessage(err), "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") throw new CarouselGenerationError("L'IA a refusé d'écrire ce carrousel.", "REFUSED");
  const out = response.parsed_output as z.infer<ReturnType<typeof singleImageFields>> & Partial<z.infer<ReturnType<typeof carouselFields>>> | null;
  const unreadable = () => new CarouselGenerationError("L'IA a renvoyé un carrousel illisible. Veuillez réessayer.", "PARSE_FAILED");
  if (!out) throw unreadable();

  const L = SLIDE_LIMITS;
  const none = { action: "", image: null };
  const brief = (text: string) => stripEmoji(text).replace(/\s+/g, " ").trim().slice(0, IMAGE_PROMPT_MAX);
  // The creator's pick wins over whatever the model wrote, so a chosen cover is never paraphrased.
  const coverTitle = fit(input.coverHeadline?.trim() || out.coverTitle, L.cover.title);
  const cover: CarouselSlide = {
    ...none,
    id: nanoid(8),
    kind: "cover",
    kicker: fit(out.coverKicker, L.cover.kicker),
    title: coverTitle,
    emphasis: emphasisIn(coverTitle, out.coverEmphasis),
    body: fit(out.coverSubtitle, L.cover.body),
    imageQuery: fit(out.coverImageQuery, 80),
    imagePrompt: brief(out.coverImagePrompt),
  };
  const visualMotif = brief(out.visualMotif).slice(0, VISUAL_MOTIF_MAX);
  if (input.length === "single") return { slides: [cover], visualMotif };

  if (!out.slides?.length || !out.ctaTitle) throw unreadable();
  const ctaTitle = fit(out.ctaTitle, L.cta.title);
  const slides: CarouselSlide[] = [
    cover,
    ...out.slides.slice(0, CONTENT_SLIDES[input.length]).map((s) => {
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
      kicker: fit(out.ctaKicker ?? "", L.cta.kicker),
      title: ctaTitle,
      emphasis: emphasisIn(ctaTitle, out.ctaEmphasis ?? ""),
      body: fit(out.ctaBody ?? "", L.cta.body),
      action: fit(out.ctaAction ?? "", L.cta.action),
      imageQuery: "",
      imagePrompt: "",
      image: null,
    },
  ];
  return { slides, visualMotif };
}
