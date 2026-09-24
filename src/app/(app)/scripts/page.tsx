import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getScriptsLibrary, getCurrentUser } from "@/server/queries";
import { PageHeader } from "@/components/shared/page-header";
import { ScriptGenerator } from "@/components/scripts/script-generator";
import { ScriptLibrary } from "@/components/scripts/script-library";
import { integrations } from "@/lib/env";
import { CREDIT_COSTS, isAdmin } from "@/lib/plans";

export const metadata: Metadata = { title: "Générateur de script" };
export const dynamic = "force-dynamic";

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<{ project?: string; topic?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const [scripts, spaces] = await Promise.all([
    getScriptsLibrary(),
    prisma.space.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, color: true, language: true, tone: true } }),
  ]);
  const cost = isAdmin(user.role) ? 0 : CREDIT_COSTS.SCRIPT_GENERATION;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Générateur de script & de hook IA" description={`Décrivez un sujet, une niche ou une URL. ${cost === 0 ? "La génération est gratuite sur ce compte" : `Chaque génération coûte ${cost} crédit`} et renvoie un hook, des scènes, un CTA et une analyse de viralité.`} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ScriptGenerator credits={user.credits} cost={cost} aiConfigured={integrations.ai()} projectId={params.project} initialTopic={params.topic} spaces={spaces} />
        <ScriptLibrary scripts={scripts.map((s) => ({ id: s.id, title: s.title, hook: s.hook, viralityScore: s.viralityScore, createdAt: s.createdAt.toISOString(), projectId: s.project.id, projectTitle: s.project.title, version: s.version, durationSec: s.estimatedDurationSec }))} />
      </div>
    </div>
  );
}
