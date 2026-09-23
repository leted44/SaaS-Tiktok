import { z } from "zod";
import { captionStyleSchema, visualLayersSchema, backgroundStyleSchema, wordTimingSchema } from "@/lib/validations";

/** Everything the Remotion composition needs. Snapshotted into RenderJob.inputProps. */
export const shortVideoPropsSchema = z.object({
  title: z.string(),
  fps: z.number().int().default(30),
  width: z.number().int().default(1080),
  height: z.number().int().default(1920),
  durationMs: z.number().int().min(1000),
  voiceoverUrl: z.string().nullable(),
  musicUrl: z.string().nullable(),
  musicVolume: z.number().min(0).max(1).default(0.18),
  /** Where playback of musicUrl starts, from the file's own beginning. */
  musicStartMs: z.number().int().min(0).default(0),
  /** Tempo of the music, when one was detected and beat sync is on. Cuts are already snapped; this drives the on-beat accent. */
  beatGrid: z.object({ bpm: z.number().positive(), offsetMs: z.number().min(0) }).nullable().default(null),
  words: z.array(wordTimingSchema),
  scenes: z.array(
    z.object({
      index: z.number().int(),
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
      onScreenText: z.string().nullable(),
      emphasis: z.array(z.string()),
    }),
  ),
  captionStyle: captionStyleSchema,
  visualLayers: visualLayersSchema,
  backgroundStyle: backgroundStyleSchema,
  watermark: z
    .object({ text: z.string().nullable(), imageUrl: z.string().nullable(), position: z.string(), opacity: z.number() })
    .nullable(),
  brand: z.object({ primaryColor: z.string(), accentColor: z.string(), fontFamily: z.string() }),
});

export type ShortVideoProps = z.infer<typeof shortVideoPropsSchema>;

export const ASPECT_DIMENSIONS = {
  VERTICAL: { "720p": [720, 1280], "1080p": [1080, 1920], "4K": [2160, 3840] },
  SQUARE: { "720p": [720, 720], "1080p": [1080, 1080], "4K": [2160, 2160] },
  HORIZONTAL: { "720p": [1280, 720], "1080p": [1920, 1080], "4K": [3840, 2160] },
} as const;

export const DEFAULT_PREVIEW_PROPS: ShortVideoProps = {
  title: "Preview",
  fps: 30,
  width: 1080,
  height: 1920,
  durationMs: 8000,
  voiceoverUrl: null,
  musicUrl: null,
  musicVolume: 0.18,
  musicStartMs: 0,
  beatGrid: null,
  words: [],
  scenes: [],
  captionStyle: captionStyleSchema.parse({}),
  visualLayers: [],
  backgroundStyle: backgroundStyleSchema.parse({}),
  watermark: null,
  brand: { primaryColor: "#7C3AED", accentColor: "#F59E0B", fontFamily: "Inter" },
};
