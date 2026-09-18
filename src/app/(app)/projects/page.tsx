import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Sparkles } from "lucide-react";
import { getProjects } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjects();
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Projects"
        description="Every video lives here — from brief to published post."
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/scripts"><Sparkles /> Generate with AI</Link></Button>
            <NewProjectDialog />
          </>
        }
      />
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Your studio is empty" description="Start with the AI script generator or create a blank project." action={<NewProjectDialog />} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={{ id: p.id, title: p.title, status: p.status, niche: p.niche, topic: p.topic, thumbnailUrl: p.thumbnailUrl, updatedAt: p.updatedAt.toISOString(), aspectRatio: p.aspectRatio, viralityScore: p.scripts[0]?.viralityScore ?? null, durationSec: p.scripts[0]?.estimatedDurationSec ?? p.targetDurationSec, hasRender: Boolean(p.renderJobs[0]?.outputUrl) }} />
          ))}
        </div>
      )}
    </div>
  );
}
