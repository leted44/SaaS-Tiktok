import { z } from "zod";
import { POST_PLATFORMS } from "@/lib/projects/progress";

/**
 * The numbers one post's results are made of, shared by the screenshot reader,
 * the manual form and the lesson writer. Every field is optional: a TikTok
 * overview screen, a retention curve and an Instagram insights page each show
 * a different subset, and a missing number is never guessed.
 */
const count = z.number().int().min(0).max(1_000_000_000).nullable();
const seconds = z.number().min(0).max(36_000).nullable();
const percent = z.number().min(0).max(100).nullable();

export const postMetricsSchema = z.object({
  views: count,
  likes: count,
  comments: count,
  shares: count,
  saves: count,
  newFollowers: count,
  profileVisits: count,
  avgWatchSec: seconds,
  avgWatchPct: percent,
  completionPct: percent,
  dropOffSec: seconds,
  durationSec: seconds,
  skipRatePct: percent,
  slidesSeen: z.number().min(0).max(40).nullable(),
  slidesTotal: z.number().int().min(1).max(40).nullable(),
});
export type PostMetrics = z.infer<typeof postMetricsSchema>;

export const METRIC_KEYS = Object.keys(postMetricsSchema.shape) as (keyof PostMetrics)[];

export const emptyMetrics = (): PostMetrics => Object.fromEntries(METRIC_KEYS.map((k) => [k, null])) as PostMetrics;

export const postFormatSchema = z.enum(["video", "carousel"]);
export type PostFormat = z.infer<typeof postFormatSchema>;
export const postPlatformSchema = z.enum(POST_PLATFORMS);

/** The labels the creator sees, in the order the form lists them. */
export const METRIC_LABELS: Record<keyof PostMetrics, { label: string; unit?: string; formats: PostFormat[] }> = {
  views: { label: "Vues", formats: ["video", "carousel"] },
  likes: { label: "J'aime", formats: ["video", "carousel"] },
  comments: { label: "Commentaires", formats: ["video", "carousel"] },
  shares: { label: "Partages", formats: ["video", "carousel"] },
  saves: { label: "Enregistrements", formats: ["video", "carousel"] },
  newFollowers: { label: "Nouveaux abonnés", formats: ["video", "carousel"] },
  profileVisits: { label: "Visites du profil", formats: ["video", "carousel"] },
  avgWatchSec: { label: "Durée moyenne regardée", unit: "s", formats: ["video"] },
  avgWatchPct: { label: "Part moyenne regardée", unit: "%", formats: ["video"] },
  completionPct: { label: "Vue en entier", unit: "%", formats: ["video"] },
  dropOffSec: { label: "La plupart partent à", unit: "s", formats: ["video"] },
  durationSec: { label: "Durée de la vidéo", unit: "s", formats: ["video"] },
  skipRatePct: { label: "Taux de passage (Instagram)", unit: "%", formats: ["video"] },
  slidesSeen: { label: "Slides vues en moyenne", formats: ["carousel"] },
  slidesTotal: { label: "Nombre de slides", formats: ["carousel"] },
};

/**
 * Fill what one number implies about another: a screen that shows "17 % of
 * the video" and a 30-second axis says 5.1 s watched on average, and the other
 * way round. Nothing is invented beyond that arithmetic.
 */
export function completeMetrics(m: PostMetrics): PostMetrics {
  const out = { ...m };
  if (out.avgWatchSec == null && out.avgWatchPct != null && out.durationSec) out.avgWatchSec = round1((out.avgWatchPct / 100) * out.durationSec);
  if (out.avgWatchPct == null && out.avgWatchSec != null && out.durationSec) out.avgWatchPct = round1(Math.min(100, (out.avgWatchSec / out.durationSec) * 100));
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Likes, comments, shares and saves per view, in %. Null without views. */
export function engagementRate(m: Pick<PostMetrics, "views" | "likes" | "comments" | "shares" | "saves">): number | null {
  if (!m.views) return null;
  const total = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
  return round1((total / m.views) * 100);
}

/** The ratios a post is judged on — comparable between posts of very different reach. */
export function ratios(m: PostMetrics) {
  return {
    views: m.views,
    engagementPct: engagementRate(m),
    followPer1000: m.views && m.newFollowers != null ? round1((m.newFollowers / m.views) * 1000) : null,
    commentPer1000: m.views && m.comments != null ? round1((m.comments / m.views) * 1000) : null,
    savePer1000: m.views && m.saves != null ? round1((m.saves / m.views) * 1000) : null,
    watchedPct: m.avgWatchPct,
    completionPct: m.completionPct,
    dropOffSec: m.dropOffSec,
    slidesSeenPct: m.slidesSeen != null && m.slidesTotal ? round1((m.slidesSeen / m.slidesTotal) * 100) : null,
  };
}
export type PostRatios = ReturnType<typeof ratios>;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round1((s[mid - 1] + s[mid]) / 2);
}

/**
 * The account's own typical post: the median of each ratio over its other
 * posts of the same format. A median, so one viral post does not make every
 * other one look like a failure. Each value comes with how many posts it
 * rests on — fewer than 3 and it is not used.
 */
export function baseline(others: PostMetrics[]): { [K in keyof PostRatios]: { value: number | null; posts: number } } {
  const all = others.map(ratios);
  const keys = Object.keys(ratios(emptyMetrics())) as (keyof PostRatios)[];
  return Object.fromEntries(
    keys.map((k) => {
      const values = all.map((r) => r[k]).filter((v): v is number => v != null);
      return [k, { value: values.length >= 3 ? median(values) : null, posts: values.length }];
    }),
  ) as { [K in keyof PostRatios]: { value: number | null; posts: number } };
}

/** "2,1 fois plus", "40 % de moins" — how one value compares with the account's usual, in words. */
export function comparedWithUsual(value: number | null, usual: number | null): string | null {
  if (value == null || usual == null || usual === 0) return null;
  const ratio = value / usual;
  if (ratio >= 1.5) return `${String(round1(ratio)).replace(".", ",")} fois plus que d'habitude`;
  if (ratio <= 0.67) return `${Math.round((1 - ratio) * 100)} % de moins que d'habitude`;
  return "dans ta moyenne";
}
