import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getCurrentWorkspace } from "@/server/queries";
import { SpaceLookEditor } from "@/components/spaces/space-look-editor";
import { effectivePlanDef } from "@/lib/plans";
import { VOICES, sortVoices } from "@/lib/tts/voices";
import { CUSTOM_VOICE_ID, customVoiceDefinition } from "@/lib/tts/resolve-voice";
import { MUSIC_TRACKS, getTrack } from "@/lib/music/library";
import { presetStyle } from "@/lib/captions/presets";
import { brandBackground } from "@/lib/autopilot/templates";
import { readSpaceKit, type CarouselLook, type VideoLook } from "@/lib/space-kit";
import { parseJson, visualLayersSchema } from "@/lib/validations";
import { carouselSlidesSchema } from "@/lib/carousel/schema";

export const metadata: Metadata = { title: "Rendu de l'espace" };
export const dynamic = "force-dynamic";

const own = (src: string | undefined | null): src is string => Boolean(src && /(^|\/)asset\//.test(src));

/**
 * A space's look, set in one place (lib/space-kit): how every new video and
 * carousel of the space comes out — voice, captions, music, background, art
 * direction, cover, carousel design — with a live preview.
 */
export default async function SpaceLookPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, workspace] = await Promise.all([params, getCurrentUser(), getCurrentWorkspace()]);
  const space = await prisma.space.findFirst({ where: { id, userId: user.id } });
  if (!space) notFound();
  const plan = effectivePlanDef(user);
  const kit = readSpaceKit(space.kit);

  // A real picture of the space under the preview: the latest image of one of its posts.
  const recent = await prisma.project.findMany({ where: { userId: user.id, spaceId: space.id }, orderBy: { updatedAt: "desc" }, take: 12, select: { visualLayers: true, carousel: { select: { slides: true } } } });
  let sample: string | null = null;
  for (const p of recent) {
    sample =
      parseJson(visualLayersSchema, p.visualLayers, []).find((l) => l.type === "image" && own(l.src))?.src ??
      parseJson(carouselSlidesSchema, p.carousel?.slides, []).find((s) => own(s.image?.url))?.image?.url ??
      null;
    if (sample) break;
  }

  const track = getTrack(workspace.defaultMusicId);
  const video: VideoLook = kit.video ?? {
    captionStyle: presetStyle(workspace.captionPreset, workspace.captionPosition),
    backgroundStyle: brandBackground(workspace),
    musicTrackId: track && track.id !== "none" && track.url ? track.id : null,
    musicUrl: null,
    musicName: null,
    musicVolume: 0.18,
    musicStartMs: 0,
    musicBpm: null,
    musicBeatOffsetMs: null,
    beatSync: true,
    voiceStability: 0.5,
    visualStyle: null,
    cover: null,
    fromProjectId: null,
    savedAt: "",
  };
  const carousel: CarouselLook = kit.carousel ?? { template: "immersive", format: "portrait", accent: null, handle: null, visualStyle: null, fromProjectId: null, savedAt: "" };

  const language = space.language ?? workspace.defaultLanguage;
  const customVoice = plan.voiceCloning ? await prisma.customVoice.findUnique({ where: { userId: user.id }, select: { name: true } }) : null;
  const voices = [
    ...(customVoice ? [customVoiceDefinition(customVoice.name)] : []),
    ...sortVoices(VOICES, language, plan.premiumVoices),
  ].map((v) => ({ id: v.id, name: v.name, style: v.style, gender: v.gender, language: v.language, premium: v.id === CUSTOM_VOICE_ID ? false : v.premium }));

  return (
    <SpaceLookEditor
      space={{ id: space.id, name: space.name, language }}
      initial={{ voiceId: space.voiceId ?? workspace.defaultVoiceId, video, carousel }}
      saved={{ video: Boolean(kit.video), carousel: Boolean(kit.carousel) }}
      sampleImage={sample}
      voices={voices}
      tracks={MUSIC_TRACKS.map((t) => ({ id: t.id, name: t.name, mood: t.mood, url: t.url, premium: t.premium }))}
      premiumAllowed={plan.premiumVoices}
      brand={{ primaryColor: workspace.primaryColor, accentColor: workspace.accentColor, fontFamily: workspace.fontFamily }}
    />
  );
}
