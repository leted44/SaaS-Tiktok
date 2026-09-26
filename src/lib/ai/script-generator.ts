import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import type { GenerateScriptInput } from "@/lib/validations";
import { normalizeSocialCopy, socialCopyFields } from "@/lib/ai/caption-generator";
import { countWords } from "@/lib/utils";

export const scriptOutputSchema = z.object({
  title: z.string().describe("Short, punchy internal title for the video (max 8 words)"),
  hook: z.string().describe("The first 1-2 sentences spoken. Must stop the scroll in under 3 seconds."),
  alternativeHooks: z.array(z.string()).describe("3 alternative hooks with different angles"),
  scenes: z
    .array(
      z.object({
        text: z.string().describe("Narration for this scene, 1-3 sentences, spoken aloud"),
        visualDescription: z.string().describe("What appears on screen — concrete, filmable"),
        brollQuery: z.string().describe("ALWAYS IN ENGLISH, whatever the script language. 2-4 words naming a concrete, filmable subject that stock libraries actually carry, e.g. 'woman counting coins', 'city street night'. Never abstract concepts, brand names, or text."),
        durationSec: z.number().describe("Estimated spoken duration in seconds"),
        emphasis: z.array(z.string()).describe("1-3 words from the text to highlight in captions"),
        onScreenText: z.string().nullable().describe("Optional big on-screen text overlay (max 5 words) or null"),
      }),
    )
    .describe("Ordered scenes after the hook. 4-10 scenes."),
  callToAction: z.string().describe("Closing line that drives the requested action, spoken aloud"),
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
}

export const SCRIPT_SYSTEM_PROMPT = `You are VidiSprint's short-form video strategist. You write scripts for TikTok, Instagram Reels and YouTube Shorts that maximize watch-time and shares.

Principles you always apply:
- The hook is spoken in the first 3 seconds and creates an open loop, a bold claim, or a specific curiosity gap. No "Hey guys", no "In this video".
- One idea per video. Every scene earns its place by moving toward the payoff.
- Write for the ear: short sentences, contractions, concrete nouns, active verbs, numbers written as digits.
- Pace: ~2.6 words per second of narration. Respect the requested target duration within ±15%.
- Pattern interrupts every 5-8 seconds: change of visual, on-screen text, or rhetorical question.
- Close the loop before the CTA. The CTA is one sentence, natural, never begging.
- Scores are honest and calibrated: 90+ is rare and reserved for genuinely exceptional concepts.
- Write in the requested language. Keep hashtags in that language plus 2-3 global ones.
- brollQuery is the one exception: always English, and always a literal thing a camera can film (a person doing something, an object, a place). "man opening empty wallet" works; "financial anxiety" returns nothing usable.
- socialCopy is read silently in a feed, not spoken. It gives a reason to watch, save or comment, and never repeats the hook word for word. TikTok rewards short and blunt; Instagram rewards a first line that earns the "more" tap. Its hashtags are returned in their own lists and never written inside the caption text.
- This is automated content a real audience will take as fact, with no human fact-checking it before it posts. Never invent a statistic, study, percentage or specific mechanism to sound authoritative. When you are not certain a specific figure or claim is true, use the true qualitative version instead of a fake-precise number — a real mechanism is more interesting than a fabricated-sounding one anyway. A punchier line is never worth a false claim.`;

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
- A hook that is vague, generic, or a phrasing a hundred other videos already used. It must land one sharp, specific claim or question framed in a way that earns the stop.
- Any scene that could be cut without the video losing anything, or that restates the previous scene instead of escalating toward the payoff.
- Any sentence too long or abstract to say out loud naturally, or any passive phrasing a real creator wouldn't use.
- Any invented, exaggerated, or suspiciously-precise claim — a statistic, a mechanism, "studies show". This is automated content a real audience will trust as fact with nobody checking it before it posts: replace anything you cannot personally stand behind with the true, still-interesting version, or cut it. A fabricated number is a defect, never a stylistic choice.
- A CTA that begs, or that doesn't follow naturally from the payoff just delivered.
- Dead pacing: nothing changing on screen or in delivery for more than ~7 seconds straight.

Score honestly against this bar, not against an average video: a script that does nothing wrong but breaks no new ground is a 60-70, not an 85 — 85+ is earned by a genuinely sharp, specific angle, not given for competent execution. If your rewrite would still score in the 70s or below on virality or hook, that means keep rewriting, not report the low score and stop — your job is to hand back a script that deserves a high score, not to grade the one you were given.

Output the complete corrected script in the exact same structure — every field, fully rewritten wherever it fell short, left as is only where it was already excellent.`;

function buildUserPrompt(input: GenerateScriptInput, brand?: { toneOfVoice?: string | null; targetAudience?: string | null }): string {
  const targetWords = Math.round(input.targetDurationSec * 2.6);
  return [
    `Topic / brief: ${input.topic}`,
    input.sourceUrl ? `Source URL for reference (use its subject as the basis): ${input.sourceUrl}` : null,
    `Niche: ${input.niche}`,
    `Tone: ${input.tone}`,
    `Hook style: ${input.hookStyle === "auto" ? "choose the strongest for this topic" : input.hookStyle}`,
    `Target duration: ${input.targetDurationSec}s (≈ ${targetWords} spoken words in total, including hook and CTA)`,
    `Language: ${input.language}`,
    input.audience ? `Audience: ${input.audience}` : brand?.targetAudience ? `Audience: ${brand.targetAudience}` : null,
    brand?.toneOfVoice ? `Brand voice guidelines: ${brand.toneOfVoice}` : null,
    `Call-to-action goal: ${input.callToActionGoal === "none" ? "no explicit CTA, end on the payoff" : input.callToActionGoal}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCriticUserPrompt(input: GenerateScriptInput, draft: GeneratedScript, brand?: { toneOfVoice?: string | null; targetAudience?: string | null }): string {
  return [buildUserPrompt(input, brand), "", "--- DRAFT TO REVIEW AND REWRITE ---", JSON.stringify(draft, null, 2)].join("\n");
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
    if (err instanceof Anthropic.APIError) throw new ScriptGenerationError(err.status ? `La requête IA a échoué (${err.status}) : ${err.message}` : `L'IA est injoignable pour le moment (${err.message}).`, "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ScriptGenerationError("L'IA a refusé d'écrire ce script. Ajustez le sujet et réessayez.", "REFUSED");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ScriptGenerationError("L'IA a renvoyé un script illisible. Veuillez réessayer.", "PARSE_FAILED");
  return { parsed, response };
}

/**
 * Two passes, not one: a single call asked to both write and honestly grade
 * its own work reliably lands on "competent" — there is nothing in that flow
 * that makes it actually rewrite a weak hook rather than just describe it as
 * a 74. The critic pass is a fresh voice, primed to reject rather than
 * defend, whose only job is to hand back something that deserves a high
 * score instead of grading the one draft it was given.
 */
export async function generateScript(
  input: GenerateScriptInput,
  brand?: { toneOfVoice?: string | null; targetAudience?: string | null },
): Promise<ScriptGenerationResult> {
  const anthropic = getClient();
  const model = env.anthropicModel;

  const draft = await callForScript(anthropic, model, SCRIPT_SYSTEM_PROMPT, buildUserPrompt(input, brand), "medium");
  const revised = await callForScript(anthropic, model, SCRIPT_CRITIC_SYSTEM_PROMPT, buildCriticUserPrompt(input, draft.parsed, brand), "high");

  const normalized = normalizeScript(revised.parsed);
  const fullText = assembleFullText(normalized);
  const wordCount = countWords(fullText);

  return {
    script: normalized,
    fullText,
    wordCount,
    estimatedDurationSec: Math.round(wordCount / 2.6),
    model: revised.response.model,
    inputTokens: draft.response.usage.input_tokens + revised.response.usage.input_tokens,
    outputTokens: draft.response.usage.output_tokens + revised.response.usage.output_tokens,
  };
}

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeScript(s: GeneratedScript): GeneratedScript {
  return {
    ...s,
    hashtags: s.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 12),
    socialCopy: normalizeSocialCopy(s.socialCopy),
    alternativeHooks: s.alternativeHooks.slice(0, 3),
    scenes: s.scenes.slice(0, 12).map((sc) => ({
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
  const hookScore = clampScore(70 + (hookWords <= 14 ? 12 : hookWords <= 20 ? 4 : -10) + (/\?|\d/.test(hook) ? 8 : 0) - (/^(hey|hi|in this video)/i.test(hook.trim()) ? 30 : 0));
  const retention = clampScore(75 - Math.abs(words - 120) / 6);
  const clarity = clampScore(72 + (fullText.split(/[.!?]/).filter((s) => countWords(s) > 22).length ? -14 : 8));
  const virality = clampScore(hookScore * 0.45 + retention * 0.35 + clarity * 0.2);
  return { virality, hook: hookScore, retention, clarity };
}
