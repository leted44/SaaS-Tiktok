import { z } from "zod";
import { visualLayersSchema, type VisualLayer } from "@/lib/validations";

/**
 * Admin test « Film en une fois »: a whole silent mini-film drawn by Kling 3
 * Pro in ONE generation — several shots, each with its own length, and the
 * recurring characters handed over as « elements » (their reference images),
 * so they stay the same from shot to shot and the cuts flow like an animated
 * short. The usual way stays untouched: the film is a second way, tried on
 * demand, and « Revenir aux images » puts the images back.
 *
 * fal.ai's Kling 3 image-to-video takes a start image, up to 6 shots
 * (multi_prompt: prompt + duration each) and a total of 3 to 15 seconds,
 * billed per second of output (0.112 $/s without sound). The shot prompts
 * name each character by its @ElementN token.
 */

export const FILM_ENDPOINT = "fal-ai/kling-video/v3/pro/image-to-video";
export const FILM_MAX_SHOTS = 6;
export const FILM_MAX_SECONDS = 15;
const SHOT_MIN_SECONDS = 2;
/** What fal charges per second of film without sound, shown before generating. */
export const FILM_USD_PER_SECOND = 0.112;
/** Most reference images sent as elements. */
export const FILM_MAX_ELEMENTS = 4;

/** The film once applied to a project (Project.film). */
export const projectFilmSchema = z.object({
  src: z.string().min(1),
  /** Each shot's length, in order: the hook's, then each scene's; the last one also carries the closing line. */
  shotsMs: z.array(z.number().int().positive()).min(1).max(FILM_MAX_SHOTS),
  /** The visuals the film replaced, put back by « Revenir aux images ». */
  previousLayers: visualLayersSchema,
});
export type ProjectFilm = z.infer<typeof projectFilmSchema>;

export function readProjectFilm(value: unknown): ProjectFilm | null {
  const parsed = projectFilmSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What a film job carries (VideoClipJob.prompt, as JSON): the shots and the characters. */
export const filmRequestSchema = z.object({
  shots: z.array(z.object({ prompt: z.string().min(1).max(2500), duration: z.number().int().min(1).max(FILM_MAX_SECONDS) })).min(1).max(FILM_MAX_SHOTS),
  elements: z.array(z.string().min(1)).max(FILM_MAX_ELEMENTS),
});
export type FilmRequest = z.infer<typeof filmRequestSchema>;

/**
 * The film's shot lengths, in whole seconds, from the video's own timeline:
 * one shot per part (hook, then each scene), the closing line riding on the
 * last shot. Kling takes 15 s at most, so the longest shots give a second
 * each — the last ones first — until it fits, never below 2 s a shot.
 * Throws when the story has more shots than one generation takes.
 */
export function planFilmShots(partsMs: number[]): number[] {
  if (partsMs.length < 2) throw new Error("Ce script n'a pas assez de plans pour un film.");
  const shotsMs = partsMs.slice(0, -1);
  shotsMs[shotsMs.length - 1] += partsMs[partsMs.length - 1];
  if (shotsMs.length > FILM_MAX_SHOTS) {
    throw new Error(`Le film en une fois prend ${FILM_MAX_SHOTS} plans au plus (accroche comprise) : ce script en a ${shotsMs.length}. Régénère le script en mini-film sans voix (6 plans).`);
  }
  const seconds = shotsMs.map((ms) => Math.max(SHOT_MIN_SECONDS, Math.round(ms / 1000)));
  while (seconds.reduce((a, b) => a + b, 0) > FILM_MAX_SECONDS) {
    const longest = Math.max(...seconds);
    if (longest <= SHOT_MIN_SECONDS) break;
    seconds[seconds.lastIndexOf(longest)] -= 1;
  }
  return seconds;
}

/** The one visual a project shows while its film is applied. */
export function filmLayer(src: string, shotsMs: number[]): VisualLayer {
  return { id: "film", type: "video", src, startMs: 0, endMs: shotsMs.reduce((a, b) => a + b, 0), fit: "cover", kenBurns: "none", opacity: 1, source: "film" };
}
