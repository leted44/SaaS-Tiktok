import type { Project, User, VideoTemplate, Workspace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captionStyleSchema, backgroundStyleSchema, visualLayersSchema, parseJson, type BackgroundStyle } from "@/lib/validations";
import { presetStyle } from "@/lib/captions/presets";
import { VOICES, VOICE_BY_ID, sortVoices } from "@/lib/tts/voices";
import { CUSTOM_VOICE_ID } from "@/lib/tts/resolve-voice";
import { getTrack } from "@/lib/music/library";
import { effectivePlanDef, clampResolution, type PlanDefinition } from "@/lib/plans";
import { isOwnStorageUrl } from "@/lib/carousel/images";
import { templateInputSchema, MIN_DURATION_SEC, MAX_DURATION_SEC, type TemplateInput } from "@/lib/autopilot/template-shared";

/** Error whose message is written for the user and safe to show as is. */
export class TemplateError extends Error {}

export function brandBackground(workspace: Pick<Workspace, "primaryColor">): BackgroundStyle {
  return { type: "gradient", colors: [workspace.primaryColor, "#0B0714"], vignette: true, grain: true };
}

/**
 * The voice a new template starts with: the brand's default when it speaks the
 * content's language and the plan allows it, otherwise the first voice that
 * does. A French script read by an American voice is never a sensible default.
 */
export function defaultVoiceFor(language: string, preferred: string | null, plan: Pick<PlanDefinition, "premiumVoices">): string {
  const lang = language.slice(0, 2).toLowerCase();
  const usable = (id: string | null) => {
    const v = id ? VOICE_BY_ID[id] : null;
    return v && v.language === lang && (!v.premium || plan.premiumVoices) ? v.id : null;
  };
  return usable(preferred) ?? sortVoices(VOICES, lang, plan.premiumVoices).find((v) => !v.premium || plan.premiumVoices)?.id ?? VOICES[0].id;
}

/** A complete, valid starting point built from the brand's defaults. */
export function defaultTemplateInput(workspace: Workspace, plan: PlanDefinition, stockConfigured: boolean): TemplateInput {
  const track = getTrack(workspace.defaultMusicId);
  const trackUsable = track && track.id !== "none" && track.url ? track : null;
  return {
    name: "Mon modèle",
    isDefault: true,
    language: workspace.defaultLanguage,
    tone: "energetic",
    targetDurationSec: 45,
    voiceId: defaultVoiceFor(workspace.defaultLanguage, workspace.defaultVoiceId, plan),
    voiceStability: 0.5,
    voiceSpeed: 1,
    aspectRatio: workspace.defaultAspect,
    resolution: clampResolution("1080p", plan.maxResolution),
    captionStyle: presetStyle(workspace.captionPreset, workspace.captionPosition),
    backgroundStyle: brandBackground(workspace),
    stockVisuals: stockConfigured,
    musicTrackId: trackUsable?.id ?? null,
    musicUrl: null,
    musicName: null,
    musicVolume: 0.18,
    musicStartMs: 0,
    musicBpm: null,
    musicBeatOffsetMs: null,
    beatSync: true,
  };
}

/**
 * The style of a video the user already made — voice, captions, background,
 * music with its start point and rhythm, format — as a template. The studio
 * stays the place to tune a look; this turns the result into the recipe.
 */
export function templateInputFromProject(project: Project & { workspace: Workspace }, plan: PlanDefinition): TemplateInput {
  const layers = parseJson(visualLayersSchema, project.visualLayers, []);
  return {
    name: `Style de « ${project.title.slice(0, 40)} »`,
    isDefault: false,
    language: project.language,
    tone: "energetic",
    targetDurationSec: Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, project.targetDurationSec)),
    voiceId: project.voiceId ?? defaultVoiceFor(project.language, project.workspace.defaultVoiceId, plan),
    voiceStability: 0.5,
    voiceSpeed: 1,
    aspectRatio: project.aspectRatio,
    resolution: clampResolution("1080p", plan.maxResolution),
    captionStyle: parseJson(captionStyleSchema, project.captionStyle, presetStyle(project.workspace.captionPreset, project.workspace.captionPosition)),
    backgroundStyle: parseJson(backgroundStyleSchema, project.backgroundStyle, brandBackground(project.workspace)),
    stockVisuals: layers.some((l) => l.src && (l.type === "video" || l.type === "image")),
    musicTrackId: project.musicUrl ? null : project.musicTrackId,
    musicUrl: project.musicUrl,
    musicName: project.musicUrl ? project.musicName : null,
    musicVolume: project.musicVolume,
    musicStartMs: project.musicStartMs,
    musicBpm: project.musicBpm,
    musicBeatOffsetMs: project.musicBeatOffsetMs,
    beatSync: project.beatSync,
  };
}

/** A stored template as the same plain object the editor and engine use. */
export function templateToInput(row: VideoTemplate): TemplateInput {
  return templateInputSchema.parse({
    ...row,
    captionStyle: parseJson(captionStyleSchema, row.captionStyle, presetStyle(null)),
    backgroundStyle: parseJson(backgroundStyleSchema, row.backgroundStyle, { type: "gradient", colors: ["#7C3AED", "#0B0714"], vignette: true, grain: true }),
  });
}

/**
 * Check a template against what the account can really use, and normalise it.
 * Everything that would make a scheduled video fail later is refused here, at
 * save time, with a message that says what to change.
 */
export async function validateTemplate(user: User, raw: unknown): Promise<TemplateInput> {
  const parsed = templateInputSchema.safeParse(raw);
  if (!parsed.success) throw new TemplateError(parsed.error.issues[0]?.message ?? "Modèle invalide.");
  const t = parsed.data;
  const plan = effectivePlanDef(user);

  if (t.voiceId === CUSTOM_VOICE_ID) {
    if (!plan.voiceCloning) throw new TemplateError("Ta voix clonée est réservée aux forfaits Pro et Agence.");
    const custom = await prisma.customVoice.findUnique({ where: { userId: user.id } });
    if (!custom) throw new TemplateError("Tu n'as pas encore de voix clonée. Crée-la dans le studio (onglet Audio) ou choisis une autre voix.");
  } else {
    const voice = VOICE_BY_ID[t.voiceId];
    if (!voice) throw new TemplateError("Cette voix n'existe plus. Choisis-en une autre.");
    if (voice.premium && !plan.premiumVoices) throw new TemplateError(`${voice.name} est une voix premium, non incluse dans ton forfait.`);
  }

  let music: Pick<TemplateInput, "musicTrackId" | "musicUrl" | "musicName"> = { musicTrackId: null, musicUrl: null, musicName: null };
  if (t.musicUrl) {
    if (!isOwnStorageUrl(t.musicUrl)) throw new TemplateError("Cette musique ne vient pas de ton espace de stockage. Importe le fichier à nouveau.");
    music = { musicTrackId: null, musicUrl: t.musicUrl, musicName: t.musicName };
  } else if (t.musicTrackId && t.musicTrackId !== "none") {
    const track = getTrack(t.musicTrackId);
    if (!track || !track.url) throw new TemplateError("Cette piste de la bibliothèque n'est pas disponible. Importe ta propre musique ou choisis « Aucune ».");
    if (track.premium && !plan.premiumVoices) throw new TemplateError(`La piste ${track.name} n'est pas incluse dans ton forfait.`);
    music = { musicTrackId: track.id, musicUrl: null, musicName: null };
  }
  const hasMusic = Boolean(music.musicUrl || music.musicTrackId);

  return {
    ...t,
    ...music,
    resolution: clampResolution(t.resolution, plan.maxResolution),
    musicStartMs: hasMusic ? Math.round(t.musicStartMs) : 0,
    musicBpm: hasMusic ? t.musicBpm : null,
    musicBeatOffsetMs: hasMusic && t.musicBeatOffsetMs !== null ? Math.round(t.musicBeatOffsetMs) : null,
  };
}

/**
 * Give a project the template's look — the same fields the studio sets when
 * the user picks a voice, a caption style, a background and music.
 */
export async function applyTemplateToProject(projectId: string, t: TemplateInput): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: {
      voiceId: t.voiceId,
      language: t.language,
      targetDurationSec: t.targetDurationSec,
      aspectRatio: t.aspectRatio,
      captionStyle: t.captionStyle,
      backgroundStyle: t.backgroundStyle,
      musicTrackId: t.musicTrackId,
      musicUrl: t.musicUrl,
      musicName: t.musicName,
      musicVolume: t.musicVolume,
      musicStartMs: Math.round(t.musicStartMs),
      musicBpm: t.musicBpm,
      musicBeatOffsetMs: t.musicBeatOffsetMs === null ? null : Math.round(t.musicBeatOffsetMs),
      beatSync: t.beatSync,
    },
  });
}
