import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import {
  ScriptGenerationError,
  SCRIPT_SYSTEM_PROMPT,
  assembleFullText,
  normalizeScript,
  scriptOutputSchema,
  type GeneratedScript,
} from "@/lib/ai/script-generator";
import { countWords } from "@/lib/utils";

export const MIN_SERIES_PARTS = 2;
export const MAX_SERIES_PARTS = 4;

const seriesOutputSchema = z.object({
  seriesTitle: z.string().describe("Name of the series itself, 2-5 words, repeated across every episode's title"),
  episodes: z
    .array(scriptOutputSchema)
    .describe("One complete script per episode, in viewing order. Exactly as many as requested, never fewer."),
});

export interface SeriesEpisode {
  script: GeneratedScript;
  fullText: string;
  wordCount: number;
  estimatedDurationSec: number;
}

export interface SeriesGenerationResult {
  seriesTitle: string;
  episodes: SeriesEpisode[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Splitting one idea into a series is a distinct craft from writing one video,
 * so it gets its own instructions on top of the shared script rules.
 *
 * The mechanic being exploited is specific: on TikTok and Reels, a viewer who
 * finishes part 1 and wants part 2 has a reason to follow — a single video
 * gives them none. That only works if each episode ends on a question the next
 * one answers, and if each still stands on its own for someone arriving at
 * part 3 first, which is how most people will actually meet the series.
 */
const SERIES_SYSTEM_PROMPT = `${SCRIPT_SYSTEM_PROMPT}

You are now writing a MULTI-PART SERIES from a single subject. On top of every rule above:

- Each episode is a complete, satisfying video on its own. Someone who lands on episode 3 first must still get value and understand it without having seen 1 and 2.
- Each episode covers a genuinely different angle of the subject. Never restate the same content with different words — if the subject cannot support that many distinct angles, write richer episodes rather than padding.
- Every episode except the last ends its callToAction on an open loop that names what the next one reveals, concretely. "Partie 2 : pourquoi tes coudes te lâchent en premier" works; "abonne-toi pour la suite" does not.
- The last episode closes the loop opened in episode 1 and pays it off. Its callToAction is the only one that asks for the follow or the comment outright.
- Each episode's hook acknowledges its place in the series in the first words when it is not the first — a viewer needs to know instantly there is more to watch.
- Each title starts with the series name, then the episode's own angle.
- Episodes are ordered so curiosity builds: the most counter-intuitive claim goes first, the practical payoff last.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicApiKey) throw new ScriptGenerationError("La génération de script IA n'est pas configurée (clé ANTHROPIC_API_KEY manquante).", "NOT_CONFIGURED");
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 300_000 });
  return client;
}

export interface SeriesSource {
  title: string;
  hook: string;
  sceneTexts: string[];
  callToAction: string;
  topic: string | null;
  niche: string | null;
  language: string;
  targetDurationSec: number;
  toneOfVoice?: string | null;
  targetAudience?: string | null;
}

export async function generateSeries(source: SeriesSource, parts: number): Promise<SeriesGenerationResult> {
  const anthropic = getClient();
  const targetWords = Math.round(source.targetDurationSec * 2.6);

  const userPrompt = [
    `Split this subject into exactly ${parts} episodes.`,
    "",
    "The existing single video on this subject, for reference — reuse what works, but do not simply cut it into pieces:",
    `Title: ${source.title}`,
    `Hook: ${source.hook}`,
    ...source.sceneTexts.map((t, i) => `Scene ${i + 1}: ${t}`),
    `Call to action: ${source.callToAction}`,
    "",
    source.topic ? `Original brief: ${source.topic}` : null,
    `Niche: ${source.niche ?? "general"}`,
    `Language: ${source.language}`,
    `Target duration per episode: ${source.targetDurationSec}s (≈ ${targetWords} spoken words each, hook and CTA included)`,
    source.targetAudience ? `Audience: ${source.targetAudience}` : null,
    source.toneOfVoice ? `Brand voice guidelines: ${source.toneOfVoice}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let response;
  try {
    response = await anthropic.messages.parse({
      model: env.anthropicModel,
      // Each episode is a full script; the ceiling scales with how many were asked for.
      max_tokens: Math.min(48_000, 12_000 * parts),
      system: [{ type: "text", text: SERIES_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(seriesOutputSchema), effort: "medium" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new ScriptGenerationError("L'IA est occupée en ce moment. Réessayez dans quelques secondes.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new ScriptGenerationError(err.status ? `La requête IA a échoué (${err.status}) : ${err.message}` : `L'IA est injoignable pour le moment (${err.message}).`, "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new ScriptGenerationError("L'IA a refusé d'écrire cette série. Ajustez le sujet et réessayez.", "REFUSED");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ScriptGenerationError("L'IA a renvoyé une série illisible. Veuillez réessayer.", "PARSE_FAILED");
  // A short series is a broken promise, not a partial success: the last episode
  // is the one that pays off the loop the first one opens.
  if (parsed.episodes.length < parts) {
    throw new ScriptGenerationError(`L'IA n'a écrit que ${parsed.episodes.length} épisode(s) sur ${parts}. Réessayez, ou demandez-en moins.`, "PARSE_FAILED");
  }

  const episodes = parsed.episodes.slice(0, parts).map((raw) => {
    const script = normalizeScript(raw);
    const fullText = assembleFullText(script);
    const wordCount = countWords(fullText);
    return { script, fullText, wordCount, estimatedDurationSec: Math.round(wordCount / 2.6) };
  });

  return {
    seriesTitle: parsed.seriesTitle.trim() || source.title,
    episodes,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
