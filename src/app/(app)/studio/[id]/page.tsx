import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectForStudio } from "@/server/queries";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { Studio } from "@/components/studio/studio";
import { PLANS, renderCost, CREDIT_COSTS } from "@/lib/plans";
import { VOICES } from "@/lib/tts/voices";
import { MUSIC_TRACKS } from "@/lib/music/library";
import { integrations } from "@/lib/env";
import { parseJson, scenesSchema, captionStyleSchema, visualLayersSchema, backgroundStyleSchema } from "@/lib/validations";
import { presetStyle } from "@/lib/captions/presets";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getProjectForStudio(id);
  return { title: data ? `${data.project.title} · Studio` : "Studio" };
}

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProjectForStudio(id);
  if (!data) notFound();
  const { project, user, activeScript, activeVoiceover } = data;
  const plan = PLANS[user.plan];

  const previewProps = activeScript
    ? buildShortVideoProps({ project, script: activeScript, voiceover: activeVoiceover, workspace: project.workspace, resolution: "1080p", watermark: plan.watermark, absolute: false })
    : null;

  return (
    <Studio
      project={{
        id: project.id,
        title: project.title,
        status: project.status,
        aspectRatio: project.aspectRatio,
        targetDurationSec: project.targetDurationSec,
        topic: project.topic,
        niche: project.niche,
        voiceId: project.voiceId,
        musicTrackId: project.musicTrackId,
        musicVolume: project.musicVolume,
        captionStyle: parseJson(captionStyleSchema, project.captionStyle, presetStyle(project.workspace.captionPreset)),
        visualLayers: parseJson(visualLayersSchema, project.visualLayers, []),
        backgroundStyle: parseJson(backgroundStyleSchema, project.backgroundStyle, { type: "gradient", colors: [project.workspace.primaryColor, "#0B0714"], vignette: true, grain: true }),
      }}
      scripts={project.scripts.map((s) => ({
        id: s.id,
        version: s.version,
        title: s.title,
        hook: s.hook,
        alternativeHooks: s.alternativeHooks,
        scenes: parseJson(scenesSchema, s.scenes, []),
        callToAction: s.callToAction,
        hashtags: s.hashtags,
        viralityScore: s.viralityScore,
        hookScore: s.hookScore,
        retentionScore: s.retentionScore,
        clarityScore: s.clarityScore,
        scoreRationale: s.scoreRationale,
        estimatedDurationSec: s.estimatedDurationSec,
        wordCount: s.wordCount,
        createdAt: s.createdAt.toISOString(),
      }))}
      activeScriptId={activeScript?.id ?? null}
      voiceover={activeVoiceover ? { id: activeVoiceover.id, audioUrl: activeVoiceover.audioUrl, durationMs: activeVoiceover.durationMs, voiceId: activeVoiceover.voiceId, provider: activeVoiceover.provider, createdAt: activeVoiceover.createdAt.toISOString() } : null}
      renders={project.renderJobs.map((r) => ({ id: r.id, status: r.status, progress: r.progress, step: r.step, outputUrl: r.outputUrl, thumbnailUrl: r.thumbnailUrl, error: r.error, createdAt: r.createdAt.toISOString(), width: r.width, height: r.height, creditsCharged: r.creditsCharged }))}
      previewProps={previewProps}
      user={{ credits: user.credits, plan: user.plan }}
      planLimits={{ watermark: plan.watermark, maxResolution: plan.maxResolution, premiumVoices: plan.premiumVoices, costs: { "720p": renderCost(user.plan, "720p"), "1080p": renderCost(user.plan, "1080p"), "4K": renderCost(user.plan, "4K"), voicePer30s: CREDIT_COSTS.VOICEOVER_PER_30S } }}
      voices={VOICES.map((v) => ({ id: v.id, name: v.name, style: v.style, gender: v.gender, premium: v.premium }))}
      tracks={MUSIC_TRACKS.map((t) => ({ id: t.id, name: t.name, mood: t.mood, url: t.url, premium: t.premium }))}
      integrations={{ ai: integrations.ai(), tts: integrations.tts() }}
    />
  );
}
