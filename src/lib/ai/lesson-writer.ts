import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { env } from "@/lib/env";

/**
 * Turns a creator's results into words: a short diagnosis of one post next to
 * the account's usual, and the account's lessons — what its own posts show
 * works and what does not — that every later script and carousel applies.
 *
 * The rules a lesson must follow are the owner's analysis method, written
 * down: compare like with like, at least three posts behind any claim, the
 * numbers in the evidence, and no lesson out of one lucky post.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1, timeout: 90_000 });
  return client;
}

/** What one post was and did, as the writer sees it. */
export interface PostForAnalysis {
  ref: string;
  format: "video" | "carousel";
  platform: string;
  postedAt: string | null;
  title: string;
  hook: string | null;
  callToAction: string | null;
  lengthLabel: string | null;
  metrics: Record<string, number | null>;
}

const DIAGNOSIS_SYSTEM = `You are the analyst of a short-form content creator (TikTok, Instagram Reels and carousels). You read one post's results next to the account's own usual numbers and write the diagnosis the creator reads in the app.

Write in French, using "tu", 2 to 3 short sentences, no title, no bullet points:
1. What this post did compared with the account's usual, citing the one or two numbers that matter most (reach, how long people watched or where they left, slides seen, follows, comments, saves).
2. The most likely reason, tied to what the post was (its hook, length, topic, call to action) — say "probablement" when it is a hypothesis.
3. One concrete thing to do on the next post.

Use only the numbers given; never invent one. When there is no usual yet to compare with, judge on the absolute numbers given and say the comparison will come with more posts. Plain words, no jargon ("taux de rétention" → "combien de temps les gens regardent").`;

const diagnosisSchema = z.object({ diagnosis: z.string().describe("The diagnosis, in French, 2 to 3 sentences.") });

export async function writeDiagnosis(post: PostForAnalysis, facts: string[]): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;
  try {
    const response = await anthropic.messages.parse({
      model: env.anthropicModel,
      max_tokens: 2000,
      system: DIAGNOSIS_SYSTEM,
      messages: [{ role: "user", content: [`The post:\n${JSON.stringify(post, null, 2)}`, `Compared with the account's usual (median of its other posts of the same format):\n${facts.length ? facts.map((f) => `- ${f}`).join("\n") : "- No usual yet: fewer than 3 other posts of this format have results."}`].join("\n\n") }],
      output_config: { format: zodOutputFormat(diagnosisSchema), effort: "low" },
    });
    return response.parsed_output?.diagnosis.trim() || null;
  } catch (err) {
    console.error("[lesson-writer] diagnosis failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

const LESSONS_SYSTEM = `You are the analyst of a short-form content creator (TikTok, Instagram Reels and carousels). From the results of the account's own posts, you write the account's lessons: what its own numbers show works and what does not. Every new script and carousel for this account will be written following them, so a wrong lesson costs real posts.

How to find a lesson:
- Compare groups of posts that differ in ONE thing the creator controls: format (video / carousel), topic family, hook type (question, claim, number, story), opening (action vs static image), length, number of slides, a question in the call to action or not, real footage vs AI images when the titles show it, the day or hour of posting.
- A lesson needs at least 3 posts on each side of the comparison, or 3 posts sharing the pattern when it is about an absolute problem (e.g. most viewers leave at 0:01 on 4 of 5 videos). Fewer than that: no lesson.
- Judge with comparable numbers: likes, comments, shares, saves and follows per view, how long people watched, where they left, slides seen. Raw views alone say little.
- A difference smaller than about 30 % is noise, not a lesson.

How to write it:
- "text": in French, "tu", one actionable rule of at most 25 words, written as what to do (e.g. « Ouvre tes vidéos sur une action en mouvement : celles qui démarrent sur une image fixe perdent la plupart des gens à 0:01. »).
- "evidence": in French, the numbers behind it, short (e.g. « 4 vidéos sur 5 perdent la majorité à 0:01 ; la seule qui démarre en action tient jusqu'à 0:04 »).
- "format": "video", "carousel" or "both".
- "confidence": "faible" (3 posts), "moyenne" (4 to 7), "élevée" (8 or more, with a large difference).
- "postCount": how many posts the lesson rests on.
- Correlation, not proof: never present a lesson as certain.
- At most 6 lessons, the strongest first. Fewer is better than weak ones. Zero is a valid answer.
- Never a lesson that would require inventing facts, figures or promises in a post.
- The creator kept some lessons as they wrote them (pinned): do not restate them. The creator deleted some: never propose them again, even reworded.`;

const lessonsSchema = z.object({
  lessons: z.array(
    z.object({
      text: z.string(),
      evidence: z.string(),
      format: z.enum(["video", "carousel", "both"]),
      confidence: z.enum(["faible", "moyenne", "élevée"]),
      postCount: z.number().int(),
    }),
  ),
});

export type WrittenLesson = z.infer<typeof lessonsSchema>["lessons"][number];

/** The account's lessons, or null when they could not be written (the existing ones are then kept). */
export async function writeLessons(posts: PostForAnalysis[], pinned: string[], dismissed: string[]): Promise<WrittenLesson[] | null> {
  const anthropic = getClient();
  if (!anthropic) return null;
  try {
    const response = await anthropic.messages.parse({
      model: env.anthropicModel,
      max_tokens: 8000,
      system: LESSONS_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `The account's posts with results (${posts.length}):\n${JSON.stringify(posts, null, 2)}`,
            pinned.length ? `Lessons the creator kept as written (do not restate):\n${pinned.map((l) => `- ${l}`).join("\n")}` : null,
            dismissed.length ? `Lessons the creator deleted (never propose again):\n${dismissed.map((l) => `- ${l}`).join("\n")}` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      output_config: { format: zodOutputFormat(lessonsSchema), effort: "high" },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return response.parsed_output.lessons
      .filter((l) => l.postCount >= 3 && l.text.trim() && l.evidence.trim())
      .slice(0, 6)
      .map((l) => ({ ...l, text: l.text.trim(), evidence: l.evidence.trim() }));
  } catch (err) {
    console.error("[lesson-writer] lessons failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
