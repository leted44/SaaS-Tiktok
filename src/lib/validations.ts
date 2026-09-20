import { z } from "zod";

// ───────────────────────── Captions ─────────────────────────

export const captionPresetIds = ["hormozi", "karaoke", "minimal", "neon", "boxed", "editorial"] as const;
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
});
export type VisualLayer = z.infer<typeof visualLayerSchema>;
export const visualLayersSchema = z.array(visualLayerSchema);

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

export const projectEditorStateSchema = z.object({
  captionStyle: captionStyleSchema,
  visualLayers: visualLayersSchema,
  backgroundStyle: backgroundStyleSchema,
  musicTrackId: z.string().nullable(),
  musicUrl: z.string().nullable(),
  musicName: z.string().nullable(),
  musicVolume: z.number().min(0).max(1),
  voiceId: z.string().nullable(),
});
export type ProjectEditorState = z.infer<typeof projectEditorStateSchema>;

export function parseJson<S extends z.ZodTypeAny>(schema: S, value: unknown, fallback: z.output<S>): z.output<S> {
  const result = schema.safeParse(value);
  return result.success ? (result.data as z.output<S>) : fallback;
}
