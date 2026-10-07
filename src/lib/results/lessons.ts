import { RESULTS_ENABLED } from "@/lib/results/config";
import type { PostResult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { carouselStateFromRow } from "@/lib/carousel/schema";
import { writeDiagnosis, writeLessons, type PostForAnalysis } from "@/lib/ai/lesson-writer";
import { baseline, comparedWithUsual, completeMetrics, METRIC_KEYS, ratios, type PostFormat, type PostMetrics } from "@/lib/results/metrics";

/**
 * The results loop: what a post did, what it says next to the account's
 * usual, and the lessons every later script and carousel of that account
 * follows. Each user's results and lessons are their own, per space — a
 * creator running two Instagram pages gets two sets of lessons, because two
 * audiences rarely react the same way.
 */

const fmtSeconds = (s: number) => `${String(Math.round(s * 10) / 10).replace(".", ",")}\u00a0s`;
const fmtPct = (p: number) => `${String(Math.round(p * 10) / 10).replace(".", ",")}\u00a0%`;

function metricsOf(row: PostResult): PostMetrics {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, row[k] ?? null])) as PostMetrics;
}

/** How a post reads to the lesson writer: what it was, and what it did. */
async function describePosts(userId: string, results: PostResult[]): Promise<PostForAnalysis[]> {
  const projectIds = [...new Set(results.map((r) => r.projectId))];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, userId },
    select: { id: true, title: true, postedAt: true, targetDurationSec: true, activeScriptId: true, carousel: { select: { template: true, format: true, handle: true, slides: true } } },
  });
  const scriptIds = projects.map((p) => p.activeScriptId).filter((id): id is string => Boolean(id));
  const scripts = await prisma.script.findMany({ where: { id: { in: scriptIds } }, select: { id: true, hook: true, callToAction: true, estimatedDurationSec: true } });
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const scriptById = new Map(scripts.map((s) => [s.id, s]));

  return results.map((r, i) => {
    const project = byProject.get(r.projectId);
    const script = project?.activeScriptId ? scriptById.get(project.activeScriptId) : undefined;
    const slides = project?.carousel ? carouselStateFromRow(project.carousel) : null;
    const cover = slides?.success ? slides.data.slides.find((s) => s.kind === "cover") : undefined;
    const metrics = metricsOf(r);
    const lengthLabel =
      r.format === "carousel"
        ? (metrics.slidesTotal ?? (slides?.success ? slides.data.slides.length : null)) != null
          ? `${metrics.slidesTotal ?? (slides?.success ? slides.data.slides.length : 0)} slides`
          : null
        : metrics.durationSec != null
          ? `${Math.round(metrics.durationSec)} s`
          : script?.estimatedDurationSec
            ? `${script.estimatedDurationSec} s`
            : null;
    const posted = project?.postedAt ?? null;
    return {
      ref: `P${i + 1}`,
      format: r.format === "carousel" ? "carousel" : "video",
      platform: r.platform,
      postedAt: posted ? posted.toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", hour: "2-digit", minute: "2-digit" }) : null,
      title: project?.title ?? "",
      hook: r.format === "carousel" ? (cover?.title ?? script?.hook ?? null) : (script?.hook ?? null),
      callToAction: script?.callToAction ?? null,
      lengthLabel,
      metrics: { ...metrics, ...Object.fromEntries(Object.entries(ratios(metrics)).map(([k, v]) => [`ratio_${k}`, v])) },
    };
  });
}

/** The account's usual next to this post, in plain facts the diagnosis is written from. */
export function usualFacts(post: PostMetrics, others: PostMetrics[], format: PostFormat): string[] {
  const usual = baseline(others);
  const mine = ratios(post);
  const facts: string[] = [];
  const line = (label: string, value: number | null, usualValue: number | null, show: (v: number) => string) => {
    if (value == null) return;
    const verdict = comparedWithUsual(value, usualValue);
    facts.push(`${label} : ${show(value)}${usualValue != null ? ` (habituel : ${show(usualValue)}) — ${verdict}` : ""}`);
  };
  line("Vues", mine.views, usual.views.value, (v) => `${Math.round(v)}`);
  line("Interactions pour 100 vues", mine.engagementPct, usual.engagementPct.value, fmtPct);
  line("Abonnés gagnés pour 1000 vues", mine.followPer1000, usual.followPer1000.value, (v) => `${v}`);
  line("Commentaires pour 1000 vues", mine.commentPer1000, usual.commentPer1000.value, (v) => `${v}`);
  line("Enregistrements pour 1000 vues", mine.savePer1000, usual.savePer1000.value, (v) => `${v}`);
  if (format === "video") {
    line("Part moyenne regardée", mine.watchedPct, usual.watchedPct.value, fmtPct);
    line("Vue en entier", mine.completionPct, usual.completionPct.value, fmtPct);
    line("La plupart partent à", mine.dropOffSec, usual.dropOffSec.value, fmtSeconds);
    if (post.skipRatePct != null) facts.push(`Taux de passage Instagram : ${fmtPct(post.skipRatePct)}`);
  } else {
    line("Slides vues", mine.slidesSeenPct, usual.slidesSeenPct.value, fmtPct);
  }
  return facts;
}

/**
 * Saves one post's results on one platform and writes its diagnosis. The
 * account's lessons are rewritten afterwards by the caller (it takes a
 * minute; the creator should not wait for it).
 */
export async function saveResult(input: { userId: string; projectId: string; platform: string; format: PostFormat; metrics: PostMetrics; source: "screenshot" | "manual" }) {
  const project = await prisma.project.findFirstOrThrow({ where: { id: input.projectId, userId: input.userId }, select: { id: true, spaceId: true } });
  const metrics = completeMetrics(input.metrics);
  const data = { ...metrics, format: input.format, spaceId: project.spaceId, source: input.source, diagnosis: null };
  const saved = await prisma.postResult.upsert({
    where: { projectId_platform: { projectId: project.id, platform: input.platform } },
    create: { userId: input.userId, projectId: project.id, platform: input.platform, ...data },
    update: data,
  });

  const others = await prisma.postResult.findMany({ where: { userId: input.userId, spaceId: project.spaceId, format: input.format, id: { not: saved.id } } });
  const facts = usualFacts(metrics, others.map(metricsOf), input.format);
  const [described] = await describePosts(input.userId, [saved]);
  const diagnosis = (await writeDiagnosis(described, facts)) ?? (facts.length ? facts.slice(0, 3).join(". ") + "." : null);
  return prisma.postResult.update({ where: { id: saved.id }, data: { diagnosis } });
}

/**
 * Rewrites a space's lessons from all its results. Lessons the creator edited
 * stay as written; deleted ones are passed on so they never come back. Below
 * three posts with results there is nothing to learn yet. When the writer
 * fails, the previous lessons are kept rather than wiped.
 */
export async function refreshLessons(userId: string, spaceId: string | null): Promise<{ lessons: number; posts: number }> {
  const results = await prisma.postResult.findMany({ where: { userId, spaceId }, orderBy: { createdAt: "asc" }, take: 120 });
  const existing = await prisma.accountLesson.findMany({ where: { userId, spaceId } });
  if (results.length < 3) {
    await prisma.accountLesson.deleteMany({ where: { userId, spaceId, pinned: false, dismissed: false } });
    return { lessons: existing.filter((l) => l.pinned && !l.dismissed).length, posts: results.length };
  }

  const posts = await describePosts(userId, results);
  const written = await writeLessons(
    posts,
    existing.filter((l) => l.pinned && !l.dismissed).map((l) => l.text),
    existing.filter((l) => l.dismissed).map((l) => l.text),
  );
  if (!written) return { lessons: existing.filter((l) => !l.dismissed).length, posts: results.length };

  await prisma.$transaction([
    prisma.accountLesson.deleteMany({ where: { userId, spaceId, pinned: false, dismissed: false } }),
    prisma.accountLesson.createMany({
      data: written.map((l) => ({ userId, spaceId, format: l.format === "both" ? null : l.format, text: l.text, evidence: l.evidence, confidence: l.confidence, postCount: l.postCount })),
    }),
  ]);
  return { lessons: written.length + existing.filter((l) => l.pinned && !l.dismissed).length, posts: results.length };
}

/** The lessons a new script or carousel of this space follows, or [] while there are none. */
export async function activeLessons(userId: string, spaceId: string | null | undefined, format: PostFormat) {
  if (!RESULTS_ENABLED) return [];
  return prisma.accountLesson.findMany({
    where: { userId, spaceId: spaceId ?? null, dismissed: false, OR: [{ format: null }, { format }] },
    orderBy: [{ pinned: "desc" }, { postCount: "desc" }],
    take: 8,
    select: { id: true, text: true, evidence: true, confidence: true },
  });
}

/** The lessons as the writers read them: a block appended to their brief, or null. */
export function lessonsBrief(lessons: { text: string; evidence: string; confidence: string }[]): string | null {
  if (!lessons.length) return null;
  return [
    "What this account's OWN published results show (its lessons). Apply them: they come from its real audience and outrank general habits — but never the rules on truthfulness and promises.",
    ...lessons.map((l) => `- ${l.text} (preuve : ${l.evidence} ; confiance ${l.confidence})`),
  ].join("\n");
}
