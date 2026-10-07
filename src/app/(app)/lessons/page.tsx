import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RESULTS_ENABLED } from "@/lib/results/config";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { LessonsBoard, type LessonScope } from "@/components/results/lessons-board";

export const metadata: Metadata = { title: "Leçons" };
export const dynamic = "force-dynamic";

/**
 * What each account's own results teach: one set of lessons per space (plus
 * one for the posts in no space), each with the numbers behind it. Every new
 * script and carousel of that space follows them.
 */
export default async function LessonsPage() {
  if (!RESULTS_ENABLED) notFound();
  const user = await getCurrentUser();
  const [spaces, lessons, counts] = await Promise.all([
    prisma.space.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.accountLesson.findMany({ where: { userId: user.id, dismissed: false }, orderBy: [{ pinned: "desc" }, { postCount: "desc" }] }),
    prisma.postResult.groupBy({ by: ["spaceId"], where: { userId: user.id }, _count: { _all: true } }),
  ]);
  const countOf = (spaceId: string | null) => counts.find((c) => c.spaceId === spaceId)?._count._all ?? 0;
  const toLesson = (l: (typeof lessons)[number]) => ({ id: l.id, text: l.text, evidence: l.evidence, confidence: l.confidence, format: l.format, postCount: l.postCount, pinned: l.pinned });

  const noSpace: LessonScope = { spaceId: null, name: spaces.length ? "Sans espace" : "Mon compte", color: "#64748B", results: countOf(null), lessons: lessons.filter((l) => l.spaceId === null).map(toLesson) };
  const scopes: LessonScope[] = [
    ...spaces.map((s) => ({ spaceId: s.id, name: s.name, color: s.color, results: countOf(s.id), lessons: lessons.filter((l) => l.spaceId === s.id).map(toLesson) })),
    // The posts in no space only get their own tab when there are any, or when there are no spaces at all.
    ...(noSpace.results || noSpace.lessons.length || !spaces.length ? [noSpace] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Leçons de tes comptes" description="Ce que tes propres résultats montrent. Chaque nouveau script et carrousel de ce compte les applique." />
      <LessonsBoard scopes={scopes} />
    </div>
  );
}
