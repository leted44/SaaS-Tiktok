import { z } from "zod";

// ───────────────────────── Captions ─────────────────────────

export const captionPresetIds = ["hormozi", "karaoke", "minimal", "neon", "boxed", "editorial", "punchy"] as const;
export type CaptionPresetId = (typeof captionPresetIds)[number];

export const captionStyleSchema = z.object({
  preset: z.enum(captionPresetIds).default("hormozi"),
  fontFamily: z.string().min(1).max(64).default("Inter"),
  fontSize: z.number().min(24).max(160).default(72),
  fontWeight: z.number().min(300).max(900).default(800),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#F59E0B"),
  highlightMode: z.enum(["color", "box", "underline", "scale"]).default("color"),
  strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  strokeWidth: z.number().min(0).max(20).default(6),
  shadow: z.boolean().default(true),
  uppercase: z.boolean().default(true),
  wordsPerLine: z.number().int().min(1).max(8).default(3),
  maxLines: z.number().int().min(1).max(3).default(2),
  position: z.enum(["top", "center", "bottom"]).default("center"),
  verticalOffset: z.number().min(-40).max(40).default(0),
  animation: z.enum(["pop", "slide", "fade", "none"]).default("pop"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  backgroundOpacity: z.number().min(0).max(1).default(0.6),
  emojiBoost: z.boolean().default(false),
});
export type CaptionStyle = z.infer<typeof captionStyleSchema>;

// ───────────────────────── Visual layers ─────────────────────────

export const visualLayerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "video", "color", "gradient"]),
  src: z.string().optional(),
  color: z.string().optional(),
  gradient: z.array(z.string()).max(3).optional(),
  startMs: z.number().min(0),
  endMs: z.number().min(0),
  fit: z.enum(["cover", "contain"]).default("cover"),
  kenBurns: z.enum(["none", "in", "out", "pan-left", "pan-right"]).default("in"),
  opacity: z.number().min(0).max(1).default(1),
  sceneIndex: z.number().int().min(0).optional(),
  /** "ai:<style>" for a layer this app generated, so a style change knows which layers to redo. Absent for stock and uploads. */
  source: z.string().max(60).optional(),
});
export type VisualLayer = z.infer<typeof visualLayerSchema>;
export const visualLayersSchema = z.array(visualLayerSchema);

/**
 * A visual the project has chosen but is not showing on any scene right now.
 *
 * Stock clips exist nowhere else in the app — an uploaded file is listed under
 * the user's assets, but a Pexels pick is only ever a URL inside a layer. Take
 * that layer off a scene and the clip is unreachable, which is why moving a
 * visual between scenes used to mean losing it.
 */
export const visualPoolItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "video"]),
  src: z.string().min(1),
  thumbnailUrl: z.string().nullable().default(null),
  label: z.string().max(120).nullable().default(null),
  /** Turned down by the user: hidden from the library and never auto-proposed again. */
  rejected: z.boolean().optional(),
});
export type VisualPoolItem = z.infer<typeof visualPoolItemSchema>;
export const visualPoolSchema = z.array(visualPoolItemSchema);

export const backgroundStyleSchema = z.object({
  type: z.enum(["gradient", "solid", "grain"]).default("gradient"),
  colors: z.array(z.string()).min(1).max(3).default(["#0F0A1F", "#3B0F7A"]),
  vignette: z.boolean().default(true),
  grain: z.boolean().default(true),
});
export type BackgroundStyle = z.infer<typeof backgroundStyleSchema>;

// ───────────────────────── Script ─────────────────────────

export const sceneSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  visualDescription: z.string(),
  brollQuery: z.string(),
  durationSec: z.number().min(0.5).max(60),
  emphasis: z.array(z.string()).default([]),
  onScreenText: z.string().nullable().default(null),
});
export type Scene = z.infer<typeof sceneSchema>;
export const scenesSchema = z.array(sceneSchema);

export const scriptEditSchema = z.object({
  title: z.string().min(1).max(160),
  hook: z.string().min(1).max(600),
  callToAction: z.string().max(400),
  hashtags: z.array(z.string().max(60)).max(20),
  scenes: z.array(sceneSchema.pick({ id: true, text: true, visualDescription: true, brollQuery: true, onScreenText: true })).min(1).max(30),
});

// ───────────────────────── Word timings ─────────────────────────

export const wordTimingSchema = z.object({
  word: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  sceneIndex: z.number().int(),
});
export type WordTiming = z.infer<typeof wordTimingSchema>;

// ───────────────────────── Forms ─────────────────────────

export const registerSchema = z.object({
  name: z.string().min(2, "Nom trop court").max(60),
  email: z.string().email("Saisissez une adresse e-mail valide"),
  password: z.string().min(8, "Utilisez au moins 8 caractères").max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const generateScriptSchema = z.object({
  projectId: z.string().optional(),
  /** Only used when creating a new project (no projectId): tags it with a space. */
  spaceId: z.string().nullable().optional(),
  topic: z.string().min(3, "Décrivez votre sujet en quelques mots").max(1200),
  niche: z.string().max(80).default("general"),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  tone: z.enum(["energetic", "educational", "storytelling", "controversial", "calm", "humorous"]).default("energetic"),
  targetDurationSec: z.number().int().min(15).max(180).default(45),
  language: z.string().min(2).max(8).default("fr"),
  audience: z.string().max(200).optional(),
  callToActionGoal: z.enum(["follow", "comment", "share", "link", "none"]).default("follow"),
  hookStyle: z.enum(["question", "bold-claim", "curiosity-gap", "story", "statistic", "auto"]).default("auto"),
});
export type GenerateScriptInput = z.infer<typeof generateScriptSchema>;

export const brandKitSchema = z.object({
  name: z.string().min(2).max(60),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().min(1).max(64),
  captionPreset: z.enum(captionPresetIds),
  captionPosition: z.enum(["top", "center", "bottom"]),
  defaultVoiceId: z.string().min(1),
  defaultLanguage: z.string().min(2).max(8),
  defaultAspect: z.enum(["VERTICAL", "SQUARE", "HORIZONTAL"]),
  defaultMusicId: z.string().nullable(),
  watermarkUrl: z.string().url().nullable().or(z.literal("")),
  watermarkOpacity: z.number().min(0).max(1),
  watermarkPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
  toneOfVoice: z.string().max(600).nullable(),
  targetAudience: z.string().max(600).nullable(),
});
export type BrandKitInput = z.infer<typeof brandKitSchema>;

export const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  topic: z.string().max(1200).optional(),
  niche: z.string().max(80).optional(),
  spaceId: z.string().nullable().optional(),
  aspectRatio: z.enum(["VERTICAL", "SQUARE", "HORIZONTAL"]).default("VERTICAL"),
  targetDurationSec: z.number().int().min(15).max(180).default(45),
});

export const voiceoverRequestSchema = z.object({
  projectId: z.string(),
  scriptId: z.string(),
  voiceId: z.string().min(1),
  stability: z.number().min(0).max(1).default(0.5),
  similarity: z.number().min(0).max(1).default(0.75),
  speed: z.number().min(0.7).max(1.3).default(1),
});

export const renderRequestSchema = z.object({
  projectId: z.string(),
  resolution: z.enum(["720p", "1080p", "4K"]).default("1080p"),
});

export const publishRequestSchema = z.object({
  renderJobId: z.string(),
  socialAccountId: z.string(),
  caption: z.string().min(1).max(2200),
  title: z.string().max(100).optional(),
  hashtags: z.array(z.string().max(60)).max(30).default([]),
  privacy: z.enum(["public", "private", "friends"]).default("public"),
  scheduledAt: z.string().datetime().optional(),
});

/** Timing breakdown a finished Lambda render stores on the job, for diagnosing slow renders. */
export const renderTimingsSchema = z.object({
  totalMs: z.number().nullable(),
  renderFramesMs: z.number().nullable(),
  encodeMs: z.number().nullable(),
  combineMs: z.number().nullable(),
  chunks: z.number(),
  lambdasInvoked: z.number(),
  retries: z.number(),
  slowestChunk: z.object({ frames: z.tuple([z.number(), z.number()]), ms: z.number() }).nullable(),
});

export const projectEditorStateSchema = z.object({
  captionStyle: captionStyleSchema,
  visualLayers: visualLayersSchema,
  visualPool: visualPoolSchema,
  backgroundStyle: backgroundStyleSchema,
  musicTrackId: z.string().nullable(),
  musicUrl: z.string().nullable(),
  musicName: z.string().nullable(),
  musicVolume: z.number().min(0).max(1),
  // Where playback of the track starts, from its own beginning — not the
  // video's. Reset to 0 whenever the track changes; see build-props.ts for
  // how it and musicBeatOffsetMs combine into where the beat grid lands on
  // the timeline once playback is trimmed to this point.
  musicStartMs: z.number().int().min(0).default(0),
  // Tempo of the chosen track, measured in the browser. Null whenever no track
  // is set or none could be found — never carried over from a previous track.
  musicBpm: z.number().positive().max(300).nullable().default(null),
  musicBeatOffsetMs: z.number().min(0).max(60_000).nullable().default(null),
  beatSync: z.boolean().default(true),
  voiceId: z.string().nullable(),
  /** Art direction of the AI scene visuals (lib/carousel/art-direction), null until they are used. */
  visualStyle: z.string().nullable().default(null),
  /** The recurring setting that ties the scenes' AI visuals together as one shoot. */
  visualMotif: z.string().max(300).default(""),
});
export type ProjectEditorState = z.infer<typeof projectEditorStateSchema>;

export function parseJson<S extends z.ZodTypeAny>(schema: S, value: unknown, fallback: z.output<S>): z.output<S> {
  const result = schema.safeParse(value);
  return result.success ? (result.data as z.output<S>) : fallback;
}
