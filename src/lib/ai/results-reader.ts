import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import sharp from "sharp";
import { env } from "@/lib/env";
import { completeMetrics, emptyMetrics, type PostFormat, type PostMetrics } from "@/lib/results/metrics";

/**
 * Reads a post's numbers off the creator's own statistics screenshots —
 * TikTok Studio's overview and retention screens, Instagram's insights —
 * the same screens the owner sends to be analysed by hand.
 *
 * Screenshots rather than the platforms' APIs: those leave out exactly what
 * decides a post's reach (how long people watched, the second they left,
 * slides seen, saves), and need an approved app per platform. The images are
 * read here and never stored; only the numbers are kept.
 */

const n = (what: string) => z.number().nullable().describe(`${what} Null when it is not shown.`);

const readingSchema = z.object({
  platform: z.enum(["tiktok", "instagram", "youtube", "facebook", "autre"]).describe("The app the screenshots come from, recognised from its interface."),
  views: n("Total views of the post (TikTok « Vues de la vidéo / de publication », Instagram « Vues »)."),
  likes: n("Likes (« J'aime »)."),
  comments: n("Comments."),
  shares: n("Shares (« Partages »)."),
  saves: n("Saves / bookmarks (« Enregistrements », the bookmark icon count)."),
  newFollowers: n("New followers gained from this post (« Nouveaux followers », « Abonnements »)."),
  profileVisits: n("Profile visits from this post (« Vues du profil », « Visites du profil »)."),
  avgWatchSec: n("Average watch time in seconds (« Temps de visionnage moyen », « Durée moyenne de visionnage »)."),
  avgWatchPct: n("Average share of the video watched, in % (« En moyenne, les spectateurs ont regardé 17 % de ta vidéo » → 17)."),
  completionPct: n("Share of viewers who watched the whole video, in % (« A regardé toute la vidéo »)."),
  dropOffSec: n("The second at which most viewers stopped watching (« La plupart des spectateurs ont cessé de regarder à 0:01 » → 1)."),
  durationSec: n("Length of the video in seconds (e.g. the end of the retention chart's time axis, « 00:30 » → 30, or a duration label)."),
  skipRatePct: n("Instagram's skip rate in % (« Taux de passage »)."),
  slidesSeen: n("Photo post / carousel: slides seen on average (TikTok « Photos vues 3,4 / 8 » → 3.4)."),
  slidesTotal: n("Photo post / carousel: total number of slides (« Photos vues 3,4 / 8 » → 8)."),
  unreadable: z.string().describe("In French, one short sentence naming anything that looked relevant but could not be read for sure. Empty string when everything was clear."),
});

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1, timeout: 60_000 });
  return client;
}

const SYSTEM = `You read the statistics screenshots of ONE social media post (TikTok Studio, Instagram insights, YouTube Studio…) and report its numbers exactly as shown.

Rules:
- Report only numbers you can actually read. Never estimate, never compute a number that is not shown, never carry a number over from another post visible on the screen (an account overview, a list of other posts).
- Expand abbreviations: « 1,8 K » / « 1.8K » = 1800, « 2,1 M » = 2100000. When both a rounded and an exact value of the same number are visible (« 1,8 K » and « 1,837 »), use the exact one. In « 1,837 » shown by an English-formatted counter the comma separates thousands (1837); in « 3,4 / 8 » it is a decimal comma (3.4).
- Times: « 0:01 » = 1 second, « 1 h:55 m:12 s » is a TOTAL watch time, not an average — ignore totals.
- Percentages as plain numbers: « 6,75 % » = 6.75.
- The screenshots may be in French or English, and several screenshots may show different parts of the same post: combine them.`;

export class ResultsReadError extends Error {}

/** The numbers on the screenshots, or a clear reason they could not be read. */
export async function readResultScreenshots(images: Buffer[], format: PostFormat): Promise<{ platform: string; metrics: PostMetrics; unreadable: string }> {
  const anthropic = getClient();
  if (!anthropic) throw new ResultsReadError("La lecture des captures n'est pas configurée.");
  if (!images.length) throw new ResultsReadError("Ajoute au moins une capture d'écran.");

  const content: Anthropic.ContentBlockParam[] = [];
  for (const [i, image] of images.entries()) {
    let data: Buffer;
    try {
      data = await sharp(image).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    } catch {
      throw new ResultsReadError(`La capture n°${i + 1} n'est pas une image lisible.`);
    }
    content.push({ type: "text", text: `Screenshot ${i + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } });
  }
  content.push({ type: "text", text: `This post is a ${format === "carousel" ? "photo carousel" : "video"}. Report its numbers.` });

  let response;
  try {
    response = await anthropic.messages.parse({
      model: env.anthropicModel,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(readingSchema), effort: "medium" },
    });
  } catch (err) {
    console.error("[results-reader] reading failed:", err instanceof Error ? err.message : err);
    throw new ResultsReadError("La lecture des captures a échoué. Réessaie dans un instant, ou saisis les chiffres à la main.");
  }
  const read = response.parsed_output;
  if (response.stop_reason === "refusal" || !read) throw new ResultsReadError("Ces captures n'ont pas pu être lues. Saisis les chiffres à la main.");

  const metrics = emptyMetrics();
  for (const key of Object.keys(metrics) as (keyof PostMetrics)[]) {
    const value = read[key];
    metrics[key] = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }
  // Counts are whole numbers; a reader that returns 1837.0 or a slides total of 8.0 is normalised here.
  for (const key of ["views", "likes", "comments", "shares", "saves", "newFollowers", "profileVisits", "slidesTotal"] as const) {
    if (metrics[key] != null) metrics[key] = Math.round(metrics[key]!);
  }
  for (const key of ["avgWatchPct", "completionPct", "skipRatePct"] as const) {
    if (metrics[key] != null && metrics[key]! > 100) metrics[key] = null;
  }
  if (format === "video") {
    metrics.slidesSeen = null;
    metrics.slidesTotal = null;
  }
  const filled = Object.values(metrics).filter((v) => v != null).length;
  if (!filled) throw new ResultsReadError("Aucun chiffre trouvé sur ces captures. Envoie l'écran de statistiques de la publication (vues, durée de visionnage…).");

  return { platform: read.platform, metrics: completeMetrics(metrics), unreadable: read.unreadable.trim() };
}
