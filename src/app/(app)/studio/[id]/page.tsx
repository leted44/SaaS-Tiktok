import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectForStudio, getCustomVoice } from "@/server/queries";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { Studio } from "@/components/studio/studio";
import { effectivePlanDef, isAdmin, renderCost, CREDIT_COSTS } from "@/lib/plans";
import { sortVoices, VOICES } from "@/lib/tts/voices";
import { customVoiceDefinition, CUSTOM_VOICE_ID } from "@/lib/tts/resolve-voice";
import { MUSIC_TRACKS } from "@/lib/music/library";
import { integrations } from "@/lib/env";
import { parseJson, scenesSchema, captionStyleSchema, visualLayersSchema, visualPoolSchema, backgroundStyleSchema, renderTimingsSchema } from "@/lib/validations";
import { fallbackSocialCopy, socialCopySchema } from "@/lib/social/captions";
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
  const plan = effectivePlanDef(user);
  const admin = isAdmin(user.role);
  const customVoice = await getCustomVoice(user.id);

  const previewProps = activeScript
    ? buildShortVideoProps({ project, script: activeScript, voiceover: activeVoiceover, workspace: project.workspace, resolution: "1080p", watermark: plan.watermark, absolute: false, snapCuts: false })
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
        musicUrl: project.musicUrl,
        musicName: project.musicName,
        musicVolume: project.musicVolume,
        musicBpm: project.musicBpm,
        musicBeatOffsetMs: project.musicBeatOffsetMs,
        beatSync: project.beatSync,
        captionStyle: parseJson(captionStyleSchema, project.captionStyle, presetStyle(project.workspace.captionPreset)),
        visualLayers: parseJson(visualLayersSchema, project.visualLayers, []),
        visualPool: parseJson(visualPoolSchema, project.visualPool, []),
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
        socialCopy: parseJson(socialCopySchema, s.socialCopy, fallbackSocialCopy({ hook: s.hook, callToAction: s.callToAction, hashtags: s.hashtags })),
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
      renders={project.renderJobs.map((r) => ({ id: r.id, status: r.status, progress: r.progress, step: r.step, outputUrl: r.outputUrl, thumbnailUrl: r.thumbnailUrl, error: r.error, createdAt: r.createdAt.toISOString(), width: r.width, height: r.height, creditsCharged: r.creditsCharged, timings: parseJson(renderTimingsSchema.nullable(), r.logs, null) }))}
      previewProps={previewProps}
      user={{ credits: user.credits, plan: user.plan }}
      planLimits={{
        watermark: plan.watermark,
        maxResolution: plan.maxResolution,
        premiumVoices: plan.premiumVoices,
        voiceCloning: plan.voiceCloning,
        costs: admin
          ? { "720p": 0, "1080p": 0, "4K": 0, voicePer30s: 0, voiceClone: 0, socialCopy: 0, script: 0 }
          : { "720p": renderCost("720p"), "1080p": renderCost("1080p"), "4K": renderCost("4K"), voicePer30s: CREDIT_COSTS.VOICEOVER_PER_30S, voiceClone: CREDIT_COSTS.VOICE_CLONE, socialCopy: CREDIT_COSTS.SOCIAL_COPY, script: CREDIT_COSTS.SCRIPT_GENERATION },
      }}
      voices={[
        ...(customVoice ? [customVoiceDefinition(customVoice.name)] : []),
        ...sortVoices(VOICES, project.language, plan.premiumVoices),
      ].map((v) => ({ id: v.id, name: v.name, style: v.style, gender: v.gender, language: v.language, premium: v.id === CUSTOM_VOICE_ID ? false : v.premium }))}
      customVoice={customVoice ? { name: customVoice.name, sampleUrl: customVoice.sampleUrl } : null}
      tracks={MUSIC_TRACKS.map((t) => ({ id: t.id, name: t.name, mood: t.mood, url: t.url, premium: t.premium }))}
      integrations={{ ai: integrations.ai(), tts: integrations.tts(), stock: integrations.stock() }}
    />
  );
}
