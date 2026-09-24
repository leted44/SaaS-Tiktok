import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import { ScriptGenerationError } from "@/lib/ai/script-generator";
import { TONE_LABELS, type Tone } from "@/lib/autopilot/template-shared";

const topicFields = z
  .object({
    topic: z
      .string()
      .describe(
        "The angle of ONE short vertical video, in the requested language: one sentence, 6 to 20 words, specific enough that two scriptwriters would write about the same thing. A concrete promise or question, never a vague theme.",
      ),
  })
  .describe("The next video to make for this account.");

const SYSTEM_PROMPT = `You are the content strategist of a short-form video account (TikTok, Instagram Reels). You pick the next video's angle.

Rules you always apply:
- Stay strictly inside the account's theme as the owner describes it. Never drift to a neighbouring niche.
- Be specific: "3 phrases to say to yourself before a hard meeting" beats "confidence". One idea, one video.
- Never repeat or lightly reword an angle the account has already covered — the list is given to you. Pick a genuinely different sub-topic, format or promise.
- Vary the format across videos: a list, a myth debunked, a mistake to avoid, a before/after, a question to the viewer, a short story.
- Write in the requested language.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicApiKey) throw new ScriptGenerationError("La génération IA n'est pas configurée (clé ANTHROPIC_API_KEY manquante).", "NOT_CONFIGURED");
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 60_000 });
  return client;
}

export interface TopicInput {
  /** What the account talks about, in the owner's words. */
  brief: string;
  language: string;
  tone: string;
  /** Angles already covered, most recent first. */
  covered: string[];
}

/**
 * Invent the topic of the next autopilot video from a space's theme, avoiding
 * everything already made for it. Errors are ScriptGenerationErrors on
 * purpose: this is the first half of writing a script, and the autopilot
 * already knows which of those are worth retrying.
 */
export async function inventTopic(input: TopicInput): Promise<string> {
  const anthropic = getClient();
  const covered = input.covered.slice(0, 60).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 140)).filter(Boolean);
  const userPrompt = [
    `Language: ${input.language}`,
    `Tone: ${TONE_LABELS[input.tone as Tone] ?? input.tone}`,
    "",
    "The account's theme, as its owner describes it:",
    input.brief.trim(),
    "",
    covered.length ? `Angles already covered (do not repeat them):\n${covered.map((t) => `- ${t}`).join("\n")}` : "No video made yet for this account.",
  ].join("\n");

  let response;
  try {
    response = await anthropic.messages.parse({
      model: env.anthropicModel,
      max_tokens: 1000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: zodOutputFormat(topicFields), effort: "low" },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new ScriptGenerationError("L'IA est occupée en ce moment. Réessayez dans quelques secondes.", "UPSTREAM");
    if (err instanceof Anthropic.APIError) throw new ScriptGenerationError(err.status ? `La requête IA a échoué (${err.status}) : ${err.message}` : `L'IA est injoignable pour le moment (${err.message}).`, "UPSTREAM");
    throw err;
  }

  if (response.stop_reason === "refusal") throw new ScriptGenerationError("L'IA a refusé de proposer un sujet pour cette thématique.", "REFUSED");
  const topic = response.parsed_output?.topic.replace(/\s+/g, " ").trim();
  if (!topic || topic.length < 3) throw new ScriptGenerationError("L'IA n'a pas proposé de sujet lisible. Nouvel essai au prochain passage.", "PARSE_FAILED");
  return topic.slice(0, 300);
}
