import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import { anthropicErrorMessage } from "@/lib/ai/anthropic-errors";
import { SCENE_VISUAL_BRIEF } from "@/lib/ai/script-generator";
import { imageBrief } from "@/lib/ai/carousel-generator";
import { INNER_SETTING, SETTING_VARIETY } from "@/lib/ai/writing-rules";
import type { VisualLayout } from "@/lib/carousel/art-direction";

/**
 * The image briefs of a finished script or carousel, written again from the
 * series bible (the "Fil conducteur") as it stands now.
 *
 * The briefs are written once, with the script. A creator who then changes
 * the Fil conducteur — a cast of three, a list of places instead of one —
 * changes nothing in them, and a brief that names a place overrules the bible
 * when the image is drawn. This rewrites only the briefs, one call for every
 * scene together (so no two scenes share a place): the spoken text, titles
 * and everything else stay as they are.
 */

export interface BriefItem {
  /** Handed back with the new brief. */
  key: string;
  /** Where it is, for the writer: "Hook", "Scène 2", "Slide 3 (couverture)". */
  label: string;
  /** What is said or written on it. */
  text: string;
  /** The brief it has now. */
  current: string;
}

export interface BriefRewriteInput {
  kind: "video" | "carousel";
  /** The carousel's image layout, which sets how much of the frame the text covers. */
  layout?: VisualLayout;
  language: string;
  /** The Fil conducteur. */
  motif: string;
  /** The character sheet in words, when the account has one. */
  cast: string | null;
  /** The account's concept, set by the creator. */
  concept?: string | null;
  items: BriefItem[];
}

const outputSchema = z.object({
  briefs: z.array(z.object({ key: z.string().describe("The key of the item, copied exactly."), brief: z.string() })),
});

const SYSTEM = (input: BriefRewriteInput) => `You rewrite the image briefs of a ${input.kind === "video" ? "short video" : "photo carousel"}. The words, the titles and the order stay as they are: only the brief of the image drawn for each item changes.

What you are given: the series bible (the creator's "Fil conducteur", the source of truth for who appears and in which world), the character sheet in words when there is one, and, for each item, what it says and the brief it has now.

Rules:
- The series bible wins over the current briefs. When it describes the cast, describe them exactly that way; when it lists places, spread the items over them.
- ${SETTING_VARIETY} Read all the items first and give each its own place and its own shot; two items in a row never share a place or a shot size.
- A current brief that is already right for its item (its action, its place, its framing) can keep those parts; what contradicts the bible, or repeats another item's place, is replaced.
- Each brief follows this specification exactly:
${input.kind === "video" ? SCENE_VISUAL_BRIEF : imageBrief(input.layout ?? "bleed")}
- ${INNER_SETTING}
- Write the briefs in English. Keep any key exactly as given and return one brief per item.`;

const userPrompt = (input: BriefRewriteInput) =>
  [
    `Language of the post: ${input.language}`,
    `Series bible (Fil conducteur):\n${input.motif.trim() || "(empty)"}`,
    input.cast ? `Character sheet in words:\n${input.cast}` : null,
    input.concept ? `Account concept: ${input.concept}` : null,
    "Items:",
    ...input.items.map((i) => `[${i.key}] ${i.label}\nSays: ${i.text.trim() || "(nothing)"}\nCurrent brief: ${i.current.trim() || "(none)"}`),
  ]
    .filter(Boolean)
    .join("\n\n");

let client: Anthropic | null = null;

/** The new brief of each item, by key. Throws a readable error when the call fails. */
export async function rewriteBriefs(input: BriefRewriteInput): Promise<Map<string, string>> {
  if (!env.anthropicApiKey) throw new Error("L'IA n'est pas configurée (clé ANTHROPIC_API_KEY manquante).");
  if (!input.items.length) return new Map();
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 120_000 });
  let response;
  try {
    response = await client.messages.parse({
      model: env.anthropicModel,
      max_tokens: 8000,
      system: SYSTEM(input),
      messages: [{ role: "user", content: userPrompt(input) }],
      output_config: { format: zodOutputFormat(outputSchema), effort: "medium" },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw new Error(anthropicErrorMessage(err));
    throw err;
  }
  const parsed = response.parsed_output;
  if (response.stop_reason === "refusal" || !parsed) throw new Error("L'IA n'a pas pu réécrire les descriptions. Réessaie.");
  const keys = new Set(input.items.map((i) => i.key));
  const out = new Map<string, string>();
  for (const { key, brief } of parsed.briefs) {
    const text = brief.replace(/\s+/g, " ").trim();
    if (keys.has(key) && text) out.set(key, text);
  }
  // A missing brief keeps its old one; an answer for fewer than half the items is not trusted at all.
  if (out.size < Math.ceil(input.items.length / 2)) throw new Error("L'IA n'a répondu que pour une partie des scènes. Rien n'a été modifié, réessaie.");
  return out;
}
