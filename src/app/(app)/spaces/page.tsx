import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSpacesData } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SpacesBoard } from "@/components/spaces/spaces-board";

export const metadata: Metadata = { title: "Espaces" };
export const dynamic = "force-dynamic";

/**
 * One card per account or theme. A space carries what every post of it is
 * written and drawn with — its Thématique, its characters, its voice, its
 * lessons — so it gets a page of its own, and a post can be started from it.
 */
export default async function SpacesPage({ searchParams }: { searchParams: Promise<{ modifier?: string }> }) {
  const [{ modifier }, { user, admin, spaces, voices, sheetGeneration }] = await Promise.all([searchParams, getSpacesData()]);
  const lessons = await prisma.accountLesson.groupBy({ by: ["spaceId"], where: { userId: user.id, dismissed: false, spaceId: { not: null } }, _count: { _all: true } });
  const lessonsBySpace = Object.fromEntries(lessons.map((l) => [l.spaceId as string, l._count._all]));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Espaces" description="Un espace par compte ou par thème : son sujet, ses personnages, sa voix et son rendu (sous-titres, musique, style des images, couverture, modèle de carrousel) s'appliquent à chaque vidéo et chaque carrousel créé dedans." />
      <SpacesBoard
        spaces={spaces.map((s) => ({ ...s, lessonCount: lessonsBySpace[s.id] ?? 0 }))}
        voices={voices}
        admin={admin}
        sheetGeneration={sheetGeneration}
        initialEdit={modifier && (modifier === "new" || spaces.some((s) => s.id === modifier)) ? modifier : null}
      />
    </div>
  );
}
