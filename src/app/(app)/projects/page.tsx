import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectsBoard } from "@/components/projects/projects-board";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { PROJECT_PROGRESS_SELECT, buildProjectProgress } from "@/lib/projects/progress";

export const metadata: Metadata = { title: "Projets" };
export const dynamic = "force-dynamic";

const VIEWS = ["todo", "ready", "posted", "all"] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [{ vue }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const rows = await prisma.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, select: PROJECT_PROGRESS_SELECT });
  const projects = rows.map(buildProjectProgress);
  const initialView = (VIEWS as readonly string[]).includes(vue ?? "") ? (vue as (typeof VIEWS)[number]) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Projets"
        description="Chaque vidéo vit ici — du brief à la publication."
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/scripts"><Sparkles /> Générer avec l'IA</Link></Button>
            <NewProjectDialog />
          </>
        }
      />
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Votre studio est vide" description="Commencez avec le générateur de script IA ou créez un projet vierge." action={<NewProjectDialog />} />
      ) : (
        <ProjectsBoard projects={projects} initialView={initialView} />
      )}
    </div>
  );
}
