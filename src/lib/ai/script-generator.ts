import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import type { GenerateScriptInput } from "@/lib/validations";
import { normalizeSocialCopy, socialCopyFields } from "@/lib/ai/caption-generator";
import { anthropicErrorMessage } from "@/lib/ai/anthropic-errors";
import { countWords } from "@/lib/utils";
import { ANNOUNCED_COUNT, NO_INVENTED_EXPERIENCE, accountConceptLine, characterSheetLine } from "@/lib/ai/writing-rules";
import { buildReviewReport, disabledReviewReport, draftProblems, skippedReviewReport, type ReviewReport } from "@/lib/ai/review-report";

/**
 * The brief an AI image of a scene is drawn from — the same formula as the
 * carousel's (lib/ai/carousel-generator): in English, in the order Google
 * recommends for its image models, precise enough that the image shows the
 * very thing the narration says. "Concrete, filmable", which this used to
 * ask for, left the model to guess the pose, the moment and the framing.
 */
const SCENE_VISUAL_BRIEF =
  "The brief for the AI image of this scene, written in ENGLISH, 60 to 120 words of precise, concrete description, in this order: (1) Subject — who or what, with a precise appearance; when the video's recurring person or character appears, describe them exactly as visualMotif does. (2) Action — precisely what the narration of this scene says, shown literally when it is physical: for an exercise, a technique, a gesture or a recipe step, the exact mechanics done correctly — body angle and line, position of the arms, hands, legs and feet, grip, contact points, the equipment or utensil and its height — caught at the single key moment the narration is about. When the text is about a mistake to avoid, show that exact mistake, clearly visible and unmistakable (e.g. elbows flared at 90°, sagging hips), never the corrected version. When the text corrects a mistake shown just before, show the corrected form from the same camera angle as the mistake, with the corrected detail unmistakably different (e.g. elbows tucked close to the body at about 45°, against elbows flared out wide), so the difference is obvious at a glance. Everywhere else — the hook or cover, a transition, a call to action, a line that only mentions mistakes in general — whatever the subject, the right way is shown, and the brief spells out the details that make it right: for an exercise, each form point and contact point (e.g. for a squat: both heels flat on the floor, knees in line with the toes, chest up, back straight); for a recipe, the correct technique and a result that looks properly done (e.g. pasta drained in a colander, a steak seared brown outside and pink inside); for any other skill or product, the correct grip, gesture, tool or setting. Image models drift toward common faults (lifted heels, fingers in front of a knife blade, food that looks raw), and a viewer would spot the very error the post warns against. Words used figuratively in the text name a position or an idea, never an object to draw: «une planche» is the plank position (body straight like a board), «une flèche, pas un T» is the shape the arms make — show the real position, never a wooden board, an arrow or a letter. The same for any subject: «brûler des calories» shows effort, never fire; «un coup de fouet» shows energy, never a whip; «la clé du succès» shows the result, never a key. Abstract ideas get a concrete, relatable situation or a clear visual metaphor instead. (3) Setting — where. (4) Composition — shot size (close-up, medium shot, full-body wide shot) and camera angle (side view, three-quarter view, low angle…) for a vertical 9:16 frame, chosen so every element the scene relies on is fully visible. Vary shots from scene to scene. Describe what to show, never what to avoid; no lighting or colour words, no text, screens or charts in the image.";

export const scriptOutputSchema = z.object({
  title: z.string().describe("Short, punchy internal title for the video (max 8 words)"),
  hook: z.string().describe("The first 1-2 sentences spoken. The first sentence is 8 words at most and creates the tension on its own: it must stop the scroll within the first second."),
  hookVisualDescription: z
    .string()
    .describe(
      `${SCENE_VISUAL_BRIEF} This is the image of the HOOK, the first frame a scroller sees: the most striking image of the video, built to stop the thumb on its own — the subject at its most telling moment (the action at its peak, the finished result, the mistake in full view), never an empty setting or a plain establishing shot — and a different shot from the first scene's (other angle or shot size) so the opening never holds one image for two scenes.`,
    ),
  alternativeHooks: z.array(z.string()).describe("3 alternative hooks with different angles"),
  scenes: z
    .array(
      z.object({
        text: z.string().describe("Narration for this scene, 1-3 sentences, spoken aloud"),
        visualDescription: z.string().describe(SCENE_VISUAL_BRIEF),
        brollQuery: z.string().describe("ALWAYS IN ENGLISH, whatever the script language. 2-4 words naming a concrete, filmable subject that stock libraries actually carry, e.g. 'woman counting coins', 'city street night'. Never abstract concepts, brand names, or text."),
        durationSec: z.number().describe("Estimated spoken duration in seconds"),
        emphasis: z.array(z.string()).describe("1-3 words from the text to highlight in captions"),
        onScreenText: z.string().nullable().describe("Optional big on-screen text overlay (max 5 words) or null"),
      }),
    )
    .describe("Ordered scenes after the hook. 4-10 scenes."),
  callToAction: z.string().describe("Closing line that drives the requested action, spoken aloud"),
  visualMotif: z
    .string()
    .describe(
      "The series bible for the AI images of this video, in the script's language, at most 450 characters, two parts. (1) The recurring cast: when a person appears, ONE precise description reused in every scene — gender, approximate age, build, skin tone, hair, and outfit with its colours (plain, no logos); otherwise the recurring character or family of objects. (2) The world the scenes share: the place and its recurring elements. No lighting or colour-grading words, nothing about size or position in the frame.",
    ),
  hashtags: z.array(z.string()).describe("8-12 hashtags without the # symbol, mix of broad and niche. This is the editable master pool; socialCopy carries the publish-ready selection for each platform."),
  socialCopy: socialCopyFields,
  scores: z.object({
    virality: z.number().describe("0-100 overall predicted virality"),
    hook: z.number().describe("0-100 scroll-stopping power of the hook"),
    retention: z.number().describe("0-100 predicted watch-through rate"),
    clarity: z.number().describe("0-100 message clarity / single-idea focus"),
    rationale: z.string().describe("2-3 sentences explaining the scores and the biggest lever to improve"),
  }),
});

export type GeneratedScript = z.infer<typeof scriptOutputSchema>;

export interface ScriptGenerationResult {
  script: GeneratedScript;
  fullText: string;
  wordCount: number;
  estimatedDurationSec: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** What the critic pass changed, and whether it was worth its cost. */
  review: ReviewReport;
}

export const SCRIPT_SYSTEM_PROMPT = `You are VidiSprint's short-form video strategist. You write scripts for TikTok, Instagram Reels and YouTube Shorts that maximize watch-time and shares.

Principles you always apply:
- Viewers decide to stay or swipe within the first second, on the first image and the first words. The hook's first sentence is 8 words at most and opens straight on the tension — a specific claim, a visible mistake, a surprising contrast, a direct "you" statement with something at stake. Nothing comes before it: no greeting, no "Hey guys", no "In this video", no scene-setting, no generic statement with nothing at stake ("Tu n'as pas besoin d'un abonnement").
- The first concrete payoff — the answer, the mistake, the key number — lands by second 6. At most one sentence of setup before it; the rest of the video proves it, explains it or says what to do.
- One idea per video. Every scene earns its place by moving toward the payoff.
- Write for the ear: short sentences, contractions, concrete nouns, active verbs, numbers written as digits.
- The narration (hook, scene text, call to action) is read aloud by a synthetic voice, which reads exactly what is written. Write every word the way it is said: no symbols (×, %, &, +, /, →, ~), no abbreviations or shorthand ("1re", "exos", "min", "kg", "vs", "etc."), no parentheses, no emoji. Numbers may stay digits; everything around them is written out ("3 séries de 12", "20 pour cent", "la première traction").
- Punctuate for breath, the way a confident speaker talks: a comma where they would pause, a full stop where they would land a point, a question mark where the voice rises. One idea per sentence; no sentence longer than about 20 words.
- Pace: ~2.6 words per second of narration. Respect the requested target duration within ±15%.
- Pattern interrupts every 5-8 seconds: change of visual, on-screen text, or rhetorical question.
- Close the loop before the CTA. The CTA is one sentence, natural, never begging. When it asks for a comment, it asks a question the viewer can answer in one word or a number (e.g. «Toi, c'est 1, 2 ou 3 ?»), never «dis-moi ce que tu en penses».
- Short beats complete: say the idea once, without padding. A viewer who watches to the end is worth more to the platform than one more point.
- Scores are honest and calibrated: 90+ is rare and reserved for genuinely exceptional concepts.
- Write in the requested language. Keep hashtags in that language plus 2-3 global ones.
- brollQuery is the one exception: always English, and always a literal thing a camera can film (a person doing something, an object, a place). "man opening empty wallet" works; "financial anxiety" returns nothing usable.
- socialCopy is read silently in a feed, not spoken. It gives a reason to watch, save or comment, and never repeats the hook word for word. TikTok rewards short and blunt; Instagram rewards a first line that earns the "more" tap. Its hashtags are returned in their own lists and never written inside the caption text.
- This is automated content a real audience will take as fact, with no human fact-checking it before it posts. Never invent a statistic, study, percentage or specific mechanism to sound authoritative. When you are not certain a specific figure or claim is true, use the true qualitative version instead of a fake-precise number — a real mechanism is more interesting than a fabricated-sounding one anyway. A punchier line is never worth a false claim.
- Never promise a result the brief does not support — a result in a fixed number of days or weeks, a guaranteed outcome, a health benefit. Bold hooks are welcome; a promise a viewer can easily prove false costs the account its credibility.
${NO_INVENTED_EXPERIENCE}
${ANNOUNCED_COUNT}`;

/**
 * A script for a photo carousel is read, not heard, and its shape is set by
 * the number of slides chosen before writing — so the material matches the
 * post instead of a 45-second video being squeezed or padded into slides.
 * Appended to the writer's rules, it replaces what only applies to the ear.
 */
export const CAROUSEL_SCRIPT_RULES = `

THIS SCRIPT IS FOR A PHOTO CAROUSEL, NOT A VIDEO. It is read slide by slide in a feed, never heard. These rules replace the ones above about speech, pace, duration and pattern interrupts:
- The hook is the COVER HEADLINE: it must stop the scroll on its own, with no voice or motion to help. Aim for 8 words or fewer, 12 at most, 80 characters maximum. A specific, surprising claim, number or truth; never a vague teaser.
- The 3 alternativeHooks are 3 alternative cover headlines with genuinely different angles (a number, a counter-intuitive truth, a direct "you" statement...), 80 characters maximum each. The creator will pick one of the four as the cover, so each must be strong enough to be the one.
- Each scene is ONE SLIDE: one complete, punchy statement that teaches something even if read alone, then one concrete proof — a mechanism, a real example, a precise action. 1 to 2 short sentences, written for the eye. No transitions ("Mais attends", "Et ce n'est pas tout", "Voici pourquoi"), no filler, no rhetorical build-up.
- The FIRST scene delivers the payoff: the answer the cover promises, stated plainly, so a reader who stops there still got it. Most readers stop after 3 or 4 slides: never keep the answer for the end. The following scenes prove it, explain why, and say what to do.
- The LAST scene ends with a short question the reader can answer in one word or a number (e.g. «Toi, c'est 1 ou 2 ?»): it is the last slide most readers still see.
- A cover headline (hook or alternativeHook) that announces a number of items announces exactly the number of content slides the format asks for — «5 preuves» on a carousel with 4 content slides is a broken promise. When in doubt, leave the number out.
- Scenes escalate: never two slides saying the same thing. Write EXACTLY the number of scenes the format asks for — no padding to fill slides, no idea squeezed out.
- The callToAction is the closing slide's ask: one explicit action, direct and specific — when it asks for a comment, it asks for the one-word answer to the last scene's question; otherwise share with someone, or follow for the next one.
- durationSec is the reading time of the slide in seconds; visualDescription and brollQuery describe the image of that slide.`;

/** What each carousel length asks of the script. */
const CAROUSEL_FORMAT: Record<NonNullable<GenerateScriptInput["carouselLength"]>, string> = {
  single:
    "Format: ONE single-image post. The hook is the entire post — the one impactful line people stop on, save and share. Write EXACTLY 1 scene: the proof or the one concrete action that makes that line useful, 1 to 2 short sentences.",
  short: "Format: a 4-slide carousel — cover, 2 content slides, closing slide. Write EXACTLY 2 scenes: the single strongest point, then its payoff or what to do.",
  full: "Format: a 6-slide carousel — cover, 4 content slides, closing slide. Write EXACTLY 4 scenes: the payoff the cover promises, then why it works, then what to do, then a last point that ends on the one-word question.",
};

/** The critic's own carousel lens: the same demanding bar, judged as a scroller swiping rather than a viewer watching. */
export const CAROUSEL_CRITIC_RULES = `

THIS SCRIPT IS FOR A PHOTO CAROUSEL, read slide by slide in a feed. Judge it as a scroller swiping, with the same demanding bar — these criteria replace the ones above about speech and pacing:
- The hook is the cover headline (80 characters maximum): would it stop YOUR thumb with no image, no voice? If not, rewrite it. The 3 alternativeHooks are alternative covers the creator will choose from: each must be strong enough to be the one, with a genuinely different angle — rewrite any weak or redundant one.
- Every scene is a slide that must teach something read alone, with one concrete proof. Cut or rewrite any slide that is vague, repeats another, or only sets up the next one.
- Any cover headline (hook or alternativeHook) announcing a number of items that differs from the number of content slides: rewrite it.
- The cover headline aims for 8 words or fewer (12 at most). The first scene gives the payoff the cover promises — a carousel that keeps its answer for the end loses most readers before it. The last scene ends on a question answerable in one word or a number.
- Keep EXACTLY the number of scenes the format asks for.
- Scores: retention is the predicted swipe-through to the last slide.`;

/**
 * A second pass, written as a separate, harsher voice reviewing someone
 * else's draft — not the same voice re-reading its own work, which tends to
 * defend what it already wrote instead of actually raising the bar. The
 * first pass explores an idea; this one is what turns a competent draft
 * into the version worth posting.
 */
export const SCRIPT_CRITIC_SYSTEM_PROMPT = `You are VidiSprint's most demanding editor-in-chief. A colleague just drafted the attached short-form video script. Your job is to make it as good as the best video actually posted in its niche this year — not to lightly polish it. Read it exactly as a scroller would: the first 3 seconds decide everything.

Rewrite the ENTIRE script, keeping only what already earns its place. Do not just patch lines — a merely acceptable script rewritten with fresh eyes still isn't good enough.

Reject and fix, specifically:
- A hook that is vague, generic, or a phrasing a hundred other videos already used. It must land one sharp, specific claim or question framed in a way that earns the stop. Its first sentence is 8 words at most, with nothing before it — viewers leave within the first second.
- A payoff that comes late: the first concrete answer, mistake or number must land by second 6, with at most one sentence of setup.
- Padding: a script longer than its target duration, or a point that adds length without adding value. Short and watched to the end beats complete and abandoned.
- Any scene that could be cut without the video losing anything, or that restates the previous scene instead of escalating toward the payoff.
- Any sentence too long or abstract to say out loud naturally, or any passive phrasing a real creator wouldn't use.
- Any symbol, abbreviation or shorthand in the narration (×, %, "1re", "exos", "kg"…): a synthetic voice reads it literally, so write it the way it is said.
- Any invented, exaggerated, or suspiciously-precise claim — a statistic, a mechanism, "studies show". This is automated content a real audience will trust as fact with nobody checking it before it posts: replace anything you cannot personally stand behind with the true, still-interesting version, or cut it. A fabricated number is a defect, never a stylistic choice.
- Any promise the brief does not support — a result in a fixed number of days or weeks, a guaranteed outcome. Keep the boldness, drop the invented guarantee.
- Any invented episode of the creator's own life — a personal anecdote, an earning, a result, a client's story the brief does not state («on me payait en crèmes», «j'ai perdu 10 kilos»). You do not know this creator: rewrite it as a direct "you" statement or a situation the viewer recognises. This applies to the hook, the alternativeHooks and the caption as much as to the scenes.
- A hook announcing a number of items («3 erreurs») that the script does not deliver exactly.
- A CTA that begs, or that doesn't follow naturally from the payoff just delivered. A comment ask is a question answerable in one word or a number.
- Dead pacing: nothing changing on screen or in delivery for more than ~7 seconds straight.

Score honestly against this bar, not against an average video: a script that does nothing wrong but breaks no new ground is a 60-70, not an 85 — 85+ is earned by a genuinely sharp, specific angle, not given for competent execution. If your rewrite would still score in the 70s or below on virality or hook, that means keep rewriting, not report the low score and stop — your job is to hand back a script that deserves a high score, not to grade the one you were given.

Output the complete corrected script in the exact same structure — every field, fully rewritten wherever it fell short, left as is only where it was already excellent.`;

/** The account's voice and audience, and what its own published results taught (see lib/results/lessons). */
export interface BrandContext {
  toneOfVoice?: string | null;
  targetAudience?: string | null;
  lessons?: string | null;
  /** The space's "Thématique": the account's subject and, often, its recurring visual world. */
  concept?: string | null;
  /** The character sheet in words (lib/characters castTextFor). */
  cast?: string | null;
}

function buildUserPrompt(input: GenerateScriptInput, brand?: BrandContext): string {
  const targetWords = Math.round(input.targetDurationSec * 2.6);
  return [
    accountConceptLine(brand?.concept),
    characterSheetLine(brand?.cast),
    `Topic / brief: ${input.topic}`,
    input.sourceUrl ? `Source URL for reference (use its subject as the basis): ${input.sourceUrl}` : null,
    `Niche: ${input.niche === "general" ? "infer it from the topic" : input.niche}`,
    `Tone: ${input.tone}`,
    `Hook style: ${input.hookStyle === "auto" ? "choose the strongest for this topic" : input.hookStyle}`,
    input.carouselLength ? CAROUSEL_FORMAT[input.carouselLength] : `Target duration: ${input.targetDurationSec}s (≈ ${targetWords} spoken words in total, including hook and CTA)`,
    `Language: ${input.language}`,
    input.audience ? `Audience: ${input.audience}` : brand?.targetAudience ? `Audience: ${brand.targetAudience}` : null,
    brand?.toneOfVoice ? `Brand voice guidelines: ${brand.toneOfVoice}` : null,
    `Call-to-action goal: ${input.callToActionGoal === "none" ? "no explicit CTA, end on the payoff" : input.callToActionGoal}`,
    brand?.lessons ? `\n${brand.lessons}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCriticUserPrompt(input: GenerateScriptInput, draft: GeneratedScript, brand?: BrandContext, problems: string[] = []): string {
  return [
    buildUserPrompt(input, brand),
    "",
    "--- DRAFT TO REVIEW AND REWRITE ---",
    JSON.stringify(draft, null, 2),
    // What a code check measured on the draft (in French, as the owner reads it): fix these first, without breaking what already works.
    problems.length ? `\n--- MEASURED PROBLEMS IN THIS DRAFT (fix every one; keep every rule the draft already keeps, including its target length) ---\n${problems.map((p) => `- ${p}`).join("\n")}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicApiKey) throw new ScriptGenerationError("La génération de script IA n'est pas configurée (clé ANTHROPIC_API_KEY manquante).", "NOT_CONFIGURED");
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 120_000 });
  return client;
}

export class ScriptGenerationError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "PARSE_FAILED" | "UPSTREAM") {
    super(message);
  }
}

async function callForScript(anthropic: Anthropic, model: string, system: string, userPrompt: string, effort: "medium" | "high") {
  let response;
  try {
    response = await anthropic.messages.parse({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(scriptOutputSchema), effort },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new ScriptGenerationError("L'IA est occupée en ce moment. Réessayez dans quelques secondes.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new ScriptGenerationError(anthropicErrorMessage(err), "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ScriptGenerationError("L'IA a refusé d'écrire ce script. Ajustez le sujet et réessayez.", "REFUSED");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ScriptGenerationError("L'IA a renvoyé un script illisible. Veuillez réessayer.", "PARSE_FAILED");
  return { parsed, response };
}

/** The critic pass (below) — kept in the code, off: see generateScript. */
const CRITIC_ENABLED = false;

/**
 * Two passes, not one: a single call asked to both write and honestly grade
 * its own work reliably lands on "competent" — there is nothing in that flow
 * that makes it actually rewrite a weak hook rather than just describe it as
 * a 74. The critic pass is a fresh voice, primed to reject rather than
 * defend, whose only job is to hand back something that deserves a high
 * score instead of grading the one draft it was given.
 *
 * Today one pass only: the owner switched the critic off (CRITIC_ENABLED).
 */
export async function generateScript(
  input: GenerateScriptInput,
  brand?: BrandContext,
): Promise<ScriptGenerationResult> {
  const anthropic = getClient();
  const model = env.anthropicModel;

  // Same passes for a carousel — only the lens changes, never the bar.
  const carousel = Boolean(input.carouselLength);
  const draft = await callForScript(anthropic, model, carousel ? SCRIPT_SYSTEM_PROMPT + CAROUSEL_SCRIPT_RULES : SCRIPT_SYSTEM_PROMPT, buildUserPrompt(input, brand), "medium");
  const draftScript = normalizeScript(draft.parsed, input.carouselLength);
  const rules = { topic: input.topic, carousel, contentSlides: input.carouselLength ? CAROUSEL_MAX_SCENES[input.carouselLength] : undefined, targetDurationSec: input.targetDurationSec };

  // The critic runs only when the draft breaks a rule a code check can see —
  // the owner's call, on cost: on drafts that broke nothing it only reworded
  // them, for about 60 % of the script's price, and once made one too long.
  const problems = draftProblems(draftScript, rules);
  // Switched off altogether since (the owner's call): a second paid pass for a
  // rewrite that was rarely worth it. The draft is kept as written; the rules
  // it breaks are still listed on the admin's card, at no cost.
  if (!CRITIC_ENABLED) {
    return finish(draftScript, draft.response.model, [draft.response.usage], disabledReviewReport({ ...rules, draft: draftScript, draftCost: { model: draft.response.model, usage: draft.response.usage }, problems }));
  }
  if (!problems.length) {
    return finish(draftScript, draft.response.model, [draft.response.usage], skippedReviewReport({ ...rules, draft: draftScript, draftCost: { model: draft.response.model, usage: draft.response.usage } }));
  }

  const revised = await callForScript(anthropic, model, carousel ? SCRIPT_CRITIC_SYSTEM_PROMPT + CAROUSEL_CRITIC_RULES : SCRIPT_CRITIC_SYSTEM_PROMPT, buildCriticUserPrompt(input, draft.parsed, brand, problems), "high");
  const revisedScript = normalizeScript(revised.parsed, input.carouselLength);
  const review = buildReviewReport({
    ...rules,
    draft: draftScript,
    final: revisedScript,
    draftCost: { model: draft.response.model, usage: draft.response.usage },
    reviewCost: { model: revised.response.model, usage: revised.response.usage },
  });
  // A rewrite that fixed nothing and broke something is worse than the draft: keep the draft.
  const keepDraft = review.verdict === "regressed";
  return finish(keepDraft ? draftScript : revisedScript, revised.response.model, [draft.response.usage, revised.response.usage], { ...review, keptDraft: keepDraft });
}

function finish(script: GeneratedScript, model: string, usages: { input_tokens: number; output_tokens: number }[], review: ReviewReport): ScriptGenerationResult {
  const fullText = assembleFullText(script);
  const wordCount = countWords(fullText);
  return {
    script,
    fullText,
    wordCount,
    estimatedDurationSec: Math.round(wordCount / 2.6),
    model,
    inputTokens: usages.reduce((n, u) => n + u.input_tokens, 0),
    outputTokens: usages.reduce((n, u) => n + u.output_tokens, 0),
    review,
  };
}

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** A carousel script keeps no more scenes than its slides can hold: 1 for a single image, 2 for a short carousel, 4 for a full one. */
const CAROUSEL_MAX_SCENES = { single: 1, short: 2, full: 4 } as const;

export function normalizeScript(s: GeneratedScript, carouselLength?: GenerateScriptInput["carouselLength"]): GeneratedScript {
  const maxScenes = carouselLength ? CAROUSEL_MAX_SCENES[carouselLength] : 12;
  return {
    ...s,
    hashtags: s.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 12),
    socialCopy: normalizeSocialCopy(s.socialCopy),
    alternativeHooks: s.alternativeHooks.slice(0, 3),
    scenes: s.scenes.slice(0, maxScenes).map((sc) => ({
      ...sc,
      durationSec: Math.max(1, Math.min(30, Number.isFinite(sc.durationSec) ? sc.durationSec : countWords(sc.text) / 2.6)),
      emphasis: sc.emphasis.slice(0, 3),
    })),
    scores: {
      virality: clampScore(s.scores.virality),
      hook: clampScore(s.scores.hook),
      retention: clampScore(s.scores.retention),
      clarity: clampScore(s.scores.clarity),
      rationale: s.scores.rationale,
    },
  };
}

export function assembleFullText(s: Pick<GeneratedScript, "hook" | "scenes" | "callToAction">): string {
  return [s.hook, ...s.scenes.map((sc) => sc.text), s.callToAction].map((t) => t.trim()).filter(Boolean).join(" ");
}

/** Deterministic score refresh after manual edits — keeps the UI honest without another AI call. */
export function heuristicScores(fullText: string, hook: string): { virality: number; hook: number; retention: number; clarity: number } {
  const words = countWords(fullText);
  const hookWords = countWords(hook);
  const firstSentence = countWords(hook.split(/[.!?…]/)[0] ?? hook);
  const hookScore = clampScore(70 + (firstSentence <= 8 ? 12 : hookWords <= 14 ? 4 : -10) + (/\?|\d/.test(hook) ? 8 : 0) - (/^(hey|hi|in this video)/i.test(hook.trim()) ? 30 : 0));
  // About 20 seconds of speech keeps viewers to the end; every word past it costs retention.
  const retention = clampScore(80 - Math.max(0, words - 55) / 4);
  const clarity = clampScore(72 + (fullText.split(/[.!?]/).filter((s) => countWords(s) > 22).length ? -14 : 8));
  const virality = clampScore(hookScore * 0.45 + retention * 0.35 + clarity * 0.2);
  return { virality, hook: hookScore, retention, clarity };
}
