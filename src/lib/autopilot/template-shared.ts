import { z } from "zod";
import { captionStyleSchema, backgroundStyleSchema, type CaptionStyle, type BackgroundStyle, type VisualLayer } from "@/lib/validations";
import { CAPTION_PRESET_BY_ID } from "@/lib/captions/presets";
import { VOICE_BY_ID, languageLabel } from "@/lib/tts/voices";
import { getTrack } from "@/lib/music/library";
import { CREDIT_COSTS, clampResolution, renderCost, voiceoverCost } from "@/lib/plans";
import { ASPECT_DIMENSIONS, DEFAULT_PREVIEW_PROPS, type ShortVideoProps } from "@/lib/render/props";
import { timelineOffsetMs } from "@/lib/render/beat-grid";
import { estimateWordTimings } from "@/lib/captions/align";
import { formatDuration } from "@/lib/utils";

/**
 * A video template: every choice the studio asks for, saved once so the
 * autopilot can make a video exactly the way the user would have by hand.
 * This module is safe in the browser (editor, summaries, preview) and on the
 * server (validation, engine).
 */

export const TONES = ["energetic", "educational", "storytelling", "controversial", "calm", "humorous"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABELS: Record<Tone, string> = {
  energetic: "Énergique",
  educational: "Pédagogique",
  storytelling: "Narratif",
  controversial: "Provocateur",
  calm: "Posé",
  humorous: "Humour",
};

export const RESOLUTIONS = ["720p", "1080p", "4K"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const ASPECTS = ["VERTICAL", "SQUARE", "HORIZONTAL"] as const;
export type Aspect = (typeof ASPECTS)[number];
export const ASPECT_LABELS: Record<Aspect, { ratio: string; hint: string }> = {
  VERTICAL: { ratio: "9:16", hint: "TikTok, Reels, Shorts" },
  SQUARE: { ratio: "1:1", hint: "Fil Instagram" },
  HORIZONTAL: { ratio: "16:9", hint: "YouTube" },
};

export const MIN_DURATION_SEC = 15;
export const MAX_DURATION_SEC = 90;

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, "Donne un nom au modèle.").max(60, "Nom trop long (60 caractères maximum)."),
  isDefault: z.boolean().default(false),
  language: z.string().min(2).max(8),
  tone: z.enum(TONES),
  targetDurationSec: z.number().int().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC),
  voiceId: z.string().min(1, "Choisis une voix."),
  voiceStability: z.number().min(0).max(1),
  voiceSpeed: z.number().min(0.7).max(1.3),
  aspectRatio: z.enum(ASPECTS),
  resolution: z.enum(RESOLUTIONS),
  captionStyle: captionStyleSchema,
  backgroundStyle: backgroundStyleSchema,
  stockVisuals: z.boolean(),
  musicTrackId: z.string().nullable(),
  musicUrl: z.string().max(2000).nullable(),
  musicName: z.string().max(200).nullable(),
  musicVolume: z.number().min(0).max(1),
  musicStartMs: z.number().min(0),
  musicBpm: z.number().positive().max(300).nullable(),
  musicBeatOffsetMs: z.number().min(0).max(60_000).nullable(),
  beatSync: z.boolean(),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

/** What a production actually used: the template's settings, frozen when it started. */
export const appliedTemplateSchema = templateInputSchema.extend({ templateId: z.string().nullable() });
export type AppliedTemplate = z.infer<typeof appliedTemplateSchema>;

/** A voice name the summary can show, including the user's own clone. */
export function voiceName(voiceId: string, customVoiceName?: string | null): string {
  if (voiceId === "custom") return customVoiceName ? `${customVoiceName} (ta voix)` : "Ta voix clonée";
  return VOICE_BY_ID[voiceId]?.name ?? voiceId;
}

export function voiceLanguage(voiceId: string, templateLanguage: string): string {
  if (voiceId === "custom") return templateLanguage;
  return VOICE_BY_ID[voiceId]?.language ?? templateLanguage;
}

const POSITION_LABELS: Record<CaptionStyle["position"], string> = { top: "en haut", center: "au centre", bottom: "en bas" };

export interface TemplateSummary {
  content: string;
  voice: string;
  captions: string;
  music: string;
  visuals: string;
  format: string;
}

/** Every setting of a template, one readable line each — what the video will be. */
export function describeTemplate(t: TemplateInput, customVoiceName?: string | null): TemplateSummary {
  const preset = CAPTION_PRESET_BY_ID[t.captionStyle.preset]?.name ?? t.captionStyle.preset;
  const track = t.musicUrl ? null : getTrack(t.musicTrackId);
  const musicTitle = t.musicUrl ? (t.musicName ?? "Ta musique") : track && track.id !== "none" ? track.name : null;
  const speed = Math.abs(t.voiceSpeed - 1) > 0.01 ? ` · vitesse ${t.voiceSpeed.toFixed(2)}×` : "";
  return {
    content: `${languageLabel(t.language)} · ${t.targetDurationSec} s · ton ${TONE_LABELS[t.tone].toLowerCase()}`,
    voice: `${voiceName(t.voiceId, customVoiceName)}${speed}`,
    captions: `${preset}, ${POSITION_LABELS[t.captionStyle.position]}${t.captionStyle.uppercase ? ", majuscules" : ""}`,
    music: musicTitle ? `${musicTitle} · ${Math.round(t.musicVolume * 100)} %${t.musicStartMs > 0 ? ` · dès ${formatDuration(t.musicStartMs)}` : ""}${t.beatSync && t.musicBpm ? " · coupes sur le rythme" : ""}` : "Aucune",
    visuals: t.stockVisuals ? "Une vidéo de banque d'images par scène" : "Fond animé seul",
    format: `${ASPECT_LABELS[t.aspectRatio].ratio} · ${t.resolution}`,
  };
}

/** Credits one video made from this template costs, at the plan's resolution cap. */
export function templateCost(t: Pick<TemplateInput, "targetDurationSec" | "voiceSpeed" | "resolution">, maxResolution: Resolution): number {
  return CREDIT_COSTS.SCRIPT_GENERATION + voiceoverCost((t.targetDurationSec * 1000) / t.voiceSpeed) + renderCost(clampResolution(t.resolution, maxResolution));
}

const SAMPLE_TEXT: Record<string, string> = {
  fr: "Voici exactement à quoi ressembleront tes vidéos. Le texte s'affiche mot par mot, au rythme de la voix. La musique, le fond et le format suivent ton modèle.",
  en: "This is exactly how your videos will look. Captions appear word by word, in time with the voice. Music, background and format follow your template.",
};

/** The sample line previews are written with, in the template's language. */
export function sampleText(language: string): string {
  return SAMPLE_TEXT[language.slice(0, 2)] ?? SAMPLE_TEXT.fr;
}

/**
 * Composition props for previewing a template: a short sample script laid out
 * the way a real video would be, with the template's captions, background,
 * music and format — and, when given, a sample clip where each scene's visual
 * will go.
 */
export function templatePreviewProps(t: TemplateInput, brand: { primaryColor: string; accentColor: string; fontFamily: string }, sampleVisual?: { url: string; type: "video" | "image" } | null): ShortVideoProps {
  const text = sampleText(t.language);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const boundaries: number[] = [];
  let cursor = 0;
  for (const s of sentences) {
    boundaries.push(cursor);
    cursor += s.split(/\s+/).filter(Boolean).length;
  }
  const words = estimateWordTimings(text, boundaries, 2.6 * t.voiceSpeed);
  const durationMs = (words[words.length - 1]?.endMs ?? 3000) + 900;
  const scenes = sentences.map((s, index) => {
    const ws = words.filter((w) => w.sceneIndex === index);
    return { index, text: s, startMs: index === 0 ? 0 : (ws[0]?.startMs ?? 0), endMs: 0, onScreenText: null, emphasis: [] as string[] };
  });
  scenes.forEach((s, i) => (s.endMs = i < scenes.length - 1 ? scenes[i + 1].startMs : durationMs));

  const [width, height] = ASPECT_DIMENSIONS[t.aspectRatio]["1080p"];
  const track = t.musicUrl ? null : getTrack(t.musicTrackId);
  const musicUrl = t.musicUrl || track?.url || null;
  const visualLayers: VisualLayer[] =
    t.stockVisuals && sampleVisual
      ? scenes.map((s, i) => ({ id: `sample-${i}`, type: sampleVisual.type, src: sampleVisual.url, startMs: s.startMs, endMs: s.endMs, fit: "cover" as const, kenBurns: sampleVisual.type === "video" ? ("none" as const) : ("in" as const), opacity: 1, sceneIndex: i }))
      : [];

  return {
    ...DEFAULT_PREVIEW_PROPS,
    title: "Aperçu du modèle",
    width,
    height,
    durationMs,
    voiceoverUrl: null,
    musicUrl,
    musicVolume: t.musicVolume,
    musicStartMs: Math.round(t.musicStartMs),
    beatGrid: musicUrl && t.beatSync && t.musicBpm ? { bpm: t.musicBpm, offsetMs: timelineOffsetMs(t.musicBeatOffsetMs ?? 0, t.musicStartMs, t.musicBpm) } : null,
    words,
    scenes,
    captionStyle: t.captionStyle,
    visualLayers,
    backgroundStyle: t.backgroundStyle as BackgroundStyle,
    watermark: null,
    brand,
  };
}
