import { z } from "zod";
import { backgroundStyleSchema, captionStyleSchema } from "@/lib/validations";
import { CAROUSEL_FORMATS, CAROUSEL_TEMPLATES } from "@/lib/carousel/schema";
import { VISUAL_STYLES } from "@/lib/carousel/art-direction";
import { COVER_EFFECTS, COVER_FONT_IDS, COVER_POSITIONS, type CoverFont } from "@/lib/video-cover";

/**
 * A space's look ("Rendu de l'espace"): everything that makes its posts look
 * like the same account, taken from one post the creator set up the way they
 * want, and given to every new post of the space.
 *
 * What a post is about stays out — its script, its images, its recurring
 * setting (motif), its length: those change from one post to the next. The
 * voice itself is the space's own `voiceId`, set at the same time.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const coverLookSchema = z.object({
  styleId: z.string().max(30).nullable().default(null),
  font: z.enum(COVER_FONT_IDS as [CoverFont, ...CoverFont[]]),
  color: hex,
  /** Empty: the account's accent colour. */
  wordColor: hex.or(z.literal("")),
  effect: z.enum(COVER_EFFECTS),
  position: z.enum(COVER_POSITIONS),
});
export type CoverLook = z.infer<typeof coverLookSchema>;

/** One video's own cover: its look plus its picture and words (Project.coverSettings). */
export const coverSettingsSchema = coverLookSchema.extend({
  img: z.string().max(2000),
  title: z.string().max(120),
  emphasis: z.string().max(60),
});
export type CoverSettingsData = z.infer<typeof coverSettingsSchema>;

export const videoLookSchema = z.object({
  captionStyle: captionStyleSchema,
  backgroundStyle: backgroundStyleSchema,
  musicTrackId: z.string().nullable(),
  musicUrl: z.string().nullable(),
  musicName: z.string().nullable(),
  musicVolume: z.number().min(0).max(1),
  musicStartMs: z.number().int().min(0),
  musicBpm: z.number().positive().max(300).nullable(),
  musicBeatOffsetMs: z.number().min(0).max(60_000).nullable(),
  beatSync: z.boolean(),
  /** The voice's tone (ElevenLabs stability) the post's voice-over was read with. */
  voiceStability: z.number().min(0).max(1).nullable(),
  visualStyle: z.enum(VISUAL_STYLES).nullable(),
  cover: coverLookSchema.nullable(),
  fromProjectId: z.string().nullable(),
  savedAt: z.string(),
});
export type VideoLook = z.infer<typeof videoLookSchema>;

export const carouselLookSchema = z.object({
  template: z.enum(CAROUSEL_TEMPLATES),
  format: z.enum(CAROUSEL_FORMATS),
  accent: hex.nullable(),
  handle: z.string().max(40).nullable(),
  visualStyle: z.enum(VISUAL_STYLES).nullable(),
  fromProjectId: z.string().nullable(),
  savedAt: z.string(),
});
export type CarouselLook = z.infer<typeof carouselLookSchema>;

export interface SpaceKit {
  video: VideoLook | null;
  carousel: CarouselLook | null;
}

/** The stored kit, each half read on its own so a damaged one never loses the other. */
export function readSpaceKit(value: unknown): SpaceKit {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const video = videoLookSchema.safeParse(raw.video);
  const carousel = carouselLookSchema.safeParse(raw.carousel);
  return { video: video.success ? video.data : null, carousel: carousel.success ? carousel.data : null };
}

/** The project columns a new video of the space starts with. */
export function videoLookColumns(look: VideoLook | null) {
  if (!look) return {};
  return {
    captionStyle: look.captionStyle,
    backgroundStyle: look.backgroundStyle,
    musicTrackId: look.musicTrackId,
    musicUrl: look.musicUrl,
    musicName: look.musicName,
    musicVolume: look.musicVolume,
    musicStartMs: look.musicStartMs,
    musicBpm: look.musicBpm,
    musicBeatOffsetMs: look.musicBeatOffsetMs,
    beatSync: look.beatSync,
    visualStyle: look.visualStyle,
  };
}

const TEMPLATE_NAMES: Record<CarouselLook["template"], string> = { immersive: "Immersif", boxed: "Encadré", minimal: "Épuré", bold: "Impact", editorial: "Éditorial", brand: "Marque" };
const FORMAT_NAMES: Record<CarouselLook["format"], string> = { portrait: "4:5", story: "9:16", square: "1:1" };
const STYLE_NAMES: Record<NonNullable<VideoLook["visualStyle"]>, string> = { cinematic: "Cinématique", studio: "Studio", noir: "Contraste", illustration: "Illustration 3D", pastel: "Doux" };
const CAPTION_NAMES: Record<VideoLook["captionStyle"]["preset"], string> = { hormozi: "Hormozi", karaoke: "Karaoké", minimal: "Minimaliste", neon: "Néon", boxed: "Encadré", editorial: "Éditorial", punchy: "Mot par mot" };
const COVER_NAMES: Record<string, string> = { hormozi: "Hormozi", karaoke: "Karaoké", minimal: "Minimaliste", neon: "Néon", boxed: "Encadré", editorial: "Éditorial", punchy: "Mot par mot" };
const COVER_SPOT: Record<CoverLook["position"], string> = { top: "en haut", middle: "au milieu", bottom: "en bas" };

/** What a saved video look holds, in a few words each — shown where it is saved, applied and on the space's card. */
export function videoLookSummary(look: VideoLook, music: string | null): string[] {
  const out = [look.captionStyle.enabled === false ? "Sans sous-titres" : `Sous-titres ${CAPTION_NAMES[look.captionStyle.preset]}`];
  if (look.visualStyle) out.push(`Images ${STYLE_NAMES[look.visualStyle]}`);
  out.push(music ? `Musique « ${music} »` : "Sans musique");
  if (look.voiceStability !== null) out.push(look.voiceStability < 0.34 ? "Voix vivante" : look.voiceStability < 0.67 ? "Voix naturelle" : "Voix posée");
  if (look.cover) out.push(`Couverture ${look.cover.styleId && COVER_NAMES[look.cover.styleId] ? COVER_NAMES[look.cover.styleId] : "perso"} ${COVER_SPOT[look.cover.position]}`);
  return out;
}

export function carouselLookSummary(look: CarouselLook): string[] {
  const out = [`Modèle ${TEMPLATE_NAMES[look.template]}`, `Format ${FORMAT_NAMES[look.format]}`];
  if (look.visualStyle) out.push(`Images ${STYLE_NAMES[look.visualStyle]}`);
  if (look.accent) out.push(`Accent ${look.accent}`);
  if (look.handle) out.push(look.handle);
  return out;
}
