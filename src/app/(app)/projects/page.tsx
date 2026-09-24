import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentWorkspace } from "@/server/queries";
import { effectivePlanDef } from "@/lib/plans";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectsBoard } from "@/components/projects/projects-board";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { PROJECT_PROGRESS_SELECT, buildProjectProgress } from "@/lib/projects/progress";
import type { SpaceOption } from "@/lib/spaces";
import { VOICES, sortVoices } from "@/lib/tts/voices";
import { CUSTOM_VOICE_ID, customVoiceDefinition } from "@/lib/tts/resolve-voice";

export const metadata: Metadata = { title: "Projets" };
export const dynamic = "force-dynamic";

const VIEWS = ["todo", "ready", "posted", "all"] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [{ vue }, user, workspace] = await Promise.all([searchParams, getCurrentUser(), getCurrentWorkspace()]);
  const plan = effectivePlanDef(user);
  const [rows, spaceRows, customVoice] = await Promise.all([
    prisma.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, select: PROJECT_PROGRESS_SELECT }),
    prisma.space.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, color: true, language: true, tone: true, voiceId: true, brief: true, _count: { select: { projects: true } } } }),
    plan.voiceCloning ? prisma.customVoice.findUnique({ where: { userId: user.id }, select: { name: true } }) : null,
  ]);
  const projects = rows.map(buildProjectProgress);
  const spaces: SpaceOption[] = spaceRows.map((s) => ({ id: s.id, name: s.name, color: s.color, language: s.language, tone: s.tone, voiceId: s.voiceId, brief: s.brief, projectCount: s._count.projects }));
  const voices = [
    ...(customVoice ? [customVoiceDefinition(customVoice.name)] : []),
    ...sortVoices(VOICES, workspace.defaultLanguage, plan.premiumVoices),
  ].map((v) => ({ id: v.id, name: v.id === CUSTOM_VOICE_ID ? `${v.name} (ta voix)` : v.name }));
  const initialView = (VIEWS as readonly string[]).includes(vue ?? "") ? (vue as (typeof VIEWS)[number]) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Projets"
        description="Chaque vidéo vit ici — du brief à la publication."
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/scripts"><Sparkles /> Générer avec l'IA</Link></Button>
            <NewProjectDialog spaces={spaces} />
          </>
        }
      />
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Votre studio est vide" description="Commencez avec le générateur de script IA ou créez un projet vierge." action={<NewProjectDialog spaces={spaces} />} />
      ) : (
        <ProjectsBoard projects={projects} initialView={initialView} spaces={spaces} voices={voices} />
      )}
    </div>
  );
}
