import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import type { GenerateScriptInput } from "@/lib/validations";
import { countWords } from "@/lib/utils";

const scriptOutputSchema = z.object({
  title: z.string().describe("Short, punchy internal title for the video (max 8 words)"),
  hook: z.string().describe("The first 1-2 sentences spoken. Must stop the scroll in under 3 seconds."),
  alternativeHooks: z.array(z.string()).describe("3 alternative hooks with different angles"),
  scenes: z
    .array(
      z.object({
        text: z.string().describe("Narration for this scene, 1-3 sentences, spoken aloud"),
        visualDescription: z.string().describe("What appears on screen — concrete, filmable"),
        brollQuery: z.string().describe("2-4 word stock footage search query"),
        durationSec: z.number().describe("Estimated spoken duration in seconds"),
        emphasis: z.array(z.string()).describe("1-3 words from the text to highlight in captions"),
        onScreenText: z.string().nullable().describe("Optional big on-screen text overlay (max 5 words) or null"),
      }),
    )
    .describe("Ordered scenes after the hook. 4-10 scenes."),
  callToAction: z.string().describe("Closing line that drives the requested action, spoken aloud"),
  hashtags: z.array(z.string()).describe("8-12 hashtags without the # symbol, mix of broad and niche"),
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

const SYSTEM_PROMPT = `You are ClipForge's short-form video strategist. You write scripts for TikTok, Instagram Reels and YouTube Shorts that maximize watch-time and shares.

Principles you always apply:
- The hook is spoken in the first 3 seconds and creates an open loop, a bold claim, or a specific curiosity gap. No "Hey guys", no "In this video".
- One idea per video. Every scene earns its place by moving toward the payoff.
- Write for the ear: short sentences, contractions, concrete nouns, active verbs, numbers written as digits.
- Pace: ~2.6 words per second of narration. Respect the requested target duration within ±15%.
- Pattern interrupts every 5-8 seconds: change of visual, on-screen text, or rhetorical question.
- Close the loop before the CTA. The CTA is one sentence, natural, never begging.
- Scores are honest and calibrated: 90+ is rare and reserved for genuinely exceptional concepts.
- Write in the requested language. Keep hashtags in that language plus 2-3 global ones.`;

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

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicApiKey) throw new ScriptGenerationError("AI script generation is not configured (ANTHROPIC_API_KEY missing).", "NOT_CONFIGURED");
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 120_000 });
  return client;
}

export class ScriptGenerationError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "PARSE_FAILED" | "UPSTREAM") {
    super(message);
  }
}

export async function generateScript(
  input: GenerateScriptInput,
  brand?: { toneOfVoice?: string | null; targetAudience?: string | null },
): Promise<ScriptGenerationResult> {
  const anthropic = getClient();
  const model = env.anthropicModel;

  let response;
  try {
    response = await anthropic.messages.parse({
      model,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserPrompt(input, brand) }],
      output_config: { format: zodOutputFormat(scriptOutputSchema), effort: "medium" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new ScriptGenerationError("The AI is busy right now. Try again in a few seconds.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new ScriptGenerationError(`AI request failed (${err.status}): ${err.message}`, "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ScriptGenerationError("The AI declined to write this script. Adjust the topic and try again.", "REFUSED");
  }
  const script = response.parsed_output;
  if (!script) throw new ScriptGenerationError("The AI returned an unreadable script. Please retry.", "PARSE_FAILED");

  const normalized = normalizeScript(script);
  const fullText = assembleFullText(normalized);
  const wordCount = countWords(fullText);

  return {
    script: normalized,
    fullText,
    wordCount,
    estimatedDurationSec: Math.round(wordCount / 2.6),
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeScript(s: GeneratedScript): GeneratedScript {
  return {
    ...s,
    hashtags: s.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "")).filter(Boolean).slice(0, 12),
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
