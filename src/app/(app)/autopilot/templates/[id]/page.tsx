import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentWorkspace } from "@/server/queries";
import { TemplateEditor } from "@/components/autopilot/template-editor";
import { UpgradePrompt } from "@/components/shared/upgrade-prompt";
import { effectivePlanDef, isAdmin } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { VOICES, sortVoices } from "@/lib/tts/voices";
import { CUSTOM_VOICE_ID, customVoiceDefinition } from "@/lib/tts/resolve-voice";
import { MUSIC_TRACKS } from "@/lib/music/library";
import { defaultTemplateInput, templateInputFromProject, templateToInput } from "@/lib/autopilot/templates";

export const metadata: Metadata = { title: "Modèle de vidéo" };
export const dynamic = "force-dynamic";

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id }, { from }, user, workspace] = await Promise.all([params, searchParams, getCurrentUser(), getCurrentWorkspace()]);
  const plan = effectivePlanDef(user);
  if (plan.autopilotQueue === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <UpgradePrompt title="Le pilote automatique est inclus dans les forfaits Pro et Agence" body="Les modèles de vidéo servent à produire automatiquement tes vidéos programmées." />
      </div>
    );
  }

  const isNew = id === "new";
  const existing = isNew ? null : await prisma.videoTemplate.findFirst({ where: { id, userId: user.id } });
  if (!isNew && !existing) notFound();

  const source = isNew && from ? await prisma.project.findFirst({ where: { id: from, userId: user.id }, include: { workspace: true } }) : null;
  const templateCount = await prisma.videoTemplate.count({ where: { userId: user.id } });
  const initial = existing
    ? templateToInput(existing)
    : source
      ? { ...templateInputFromProject(source, plan), isDefault: templateCount === 0 }
      : { ...defaultTemplateInput(workspace, plan, integrations.stock()), isDefault: templateCount === 0, name: templateCount === 0 ? "Mon modèle" : `Modèle ${templateCount + 1}` };

  const [customVoice, projects] = await Promise.all([
    prisma.customVoice.findUnique({ where: { userId: user.id } }),
    prisma.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, updatedAt: true } }),
  ]);

  const voices = [
    ...(customVoice && plan.voiceCloning ? [customVoiceDefinition(customVoice.name)] : []),
    ...sortVoices(VOICES, initial.language, plan.premiumVoices),
  ].map((v) => ({ id: v.id, name: v.name, style: v.style, gender: v.gender, language: v.language, premium: v.id === CUSTOM_VOICE_ID ? false : v.premium }));

  return (
    <TemplateEditor
      templateId={existing?.id ?? null}
      initial={initial}
      isOnlyTemplate={templateCount <= 1 && Boolean(existing)}
      copiedFrom={source ? source.title : null}
      voices={voices}
      customVoiceName={customVoice?.name ?? null}
      tracks={MUSIC_TRACKS.map((t) => ({ id: t.id, name: t.name, mood: t.mood, url: t.url, premium: t.premium }))}
      projects={projects.map((p) => ({ id: p.id, title: p.title }))}
      plan={{ premiumVoices: plan.premiumVoices, maxResolution: plan.maxResolution, free: isAdmin(user.role) }}
      stockConfigured={integrations.stock()}
      brand={{ primaryColor: workspace.primaryColor, accentColor: workspace.accentColor, fontFamily: workspace.fontFamily }}
    />
  );
}
