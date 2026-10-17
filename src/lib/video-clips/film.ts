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
 * billed per second of output (Pro 0.112 $/s without sound), in Standard (720p) or Pro (1080p), 10, 12 or 15 s long. The shot prompts
 * name each character by its @ElementN token.
 */

/** Kling 3 in two qualities: Standard (720p, cheaper) and Pro (1080p). */
export type FilmQuality = "standard" | "pro";
export const FILM_ENDPOINTS: Record<FilmQuality, string> = {
  standard: "fal-ai/kling-video/v3/standard/image-to-video",
  pro: "fal-ai/kling-video/v3/pro/image-to-video",
};
/** What fal charges per second of film without sound, shown before generating. Pro read on fal's page; Standard estimated until confirmed there. */
export const FILM_USD_PER_SECOND: Record<FilmQuality, number> = { standard: 0.084, pro: 0.112 };
export const FILM_PRICE_CONFIRMED: Record<FilmQuality, boolean> = { standard: false, pro: true };
/** The film lengths offered: a gag reads as well in 10 s, and a shorter film is paid less and watched to the end more often. */
export const FILM_LENGTHS = [10, 12, 15] as const;
export type FilmLength = (typeof FILM_LENGTHS)[number];
export const FILM_MAX_SHOTS = 6;
export const FILM_MAX_SECONDS = 15;
const SHOT_MIN_SECONDS = 2;
/** Most reference images sent as elements. */
export const FILM_MAX_ELEMENTS = 4;

/** The film once applied to a project (Project.film). */
export const projectFilmSchema = z.object({
  src: z.string().min(1),
  /** Each shot's length, in order: the hook's, then each scene's; the last one also carries the closing line. */
  shotsMs: z.array(z.number().int().positive()).min(1).max(30),
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
  /** Each part's length in the film (hook, then each scene, the last one carrying the closing line) — several parts share a shot when the film is shorter than the script. */
  partsMs: z.array(z.number().int().positive()).optional(),
});
export type FilmRequest = z.infer<typeof filmRequestSchema>;

/**
 * How the script's parts become the film's shots, for a film of `target`
 * seconds: one shot per part (hook, then each scene; the closing line rides
 * on the last), whole seconds, at least 2 s a shot, about 2.5 s on average. A film
 * shorter than the script takes fewer shots: neighbouring scenes share one,
 * in groups of even lengths, the hook and the punchline keeping their own.
 * The film's seconds are then shared in proportion to what each shot tells.
 * Each part keeps its share of its shot (`partsMs`), which times the
 * captions and the timeline once the film is on.
 */
export function planFilm(partsMs: number[], target: number): { shots: { parts: number[]; seconds: number }[]; partsMs: number[] } {
  if (partsMs.length < 2) throw new Error("Ce script n'a pas assez de plans pour un film.");
  // The closing line rides on the last shot without weighing in its share.
  const parts = partsMs.slice(0, -1);
  // About 2.5 s a shot on average: enough for a gesture to land.
  const maxShots = Math.min(FILM_MAX_SHOTS, Math.round(target / 2.5));
  const groups = groupParts(parts, maxShots);
  // The film's seconds shared in proportion to what each shot tells (never below 2 s), the leftover seconds to the largest remainders.
  const scriptMs = groups.reduce((a, g) => a + g.ms, 0);
  const total = Math.max(groups.length * SHOT_MIN_SECONDS, Math.min(target, Math.round(scriptMs / 1000)));
  const exact = groups.map((g) => (total * g.ms) / scriptMs);
  const seconds = exact.map((x) => Math.max(SHOT_MIN_SECONDS, Math.floor(x)));
  while (seconds.reduce((a, b) => a + b, 0) < total) {
    let best = 0;
    exact.forEach((x, k) => { if (x - seconds[k] > exact[best] - seconds[best]) best = k; });
    seconds[best] += 1;
  }
  while (seconds.reduce((a, b) => a + b, 0) > total) {
    const longest = Math.max(...seconds);
    if (longest <= SHOT_MIN_SECONDS) break;
    seconds[seconds.lastIndexOf(longest)] -= 1;
  }
  const outParts: number[] = [];
  groups.forEach((g, k) => {
    const total = seconds[k] * 1000;
    let left = total;
    g.parts.forEach((p, n) => {
      const share = n === g.parts.length - 1 ? left : Math.round((total * parts[p]) / g.ms);
      outParts.push(share);
      left -= share;
    });
  });
  return { shots: groups.map((g, k) => ({ parts: g.parts, seconds: seconds[k] })), partsMs: outParts };
}

/**
 * The parts (by index) gathered into at most `count` shots of neighbouring
 * parts. The hook and the punchline (the last part) keep a shot of their own
 * when there is room; the parts between are split into groups of the most
 * even lengths (least sum of squared group lengths), so no shot is left
 * telling three beats while its neighbours tell one.
 */
function groupParts(parts: number[], count: number): { parts: number[]; ms: number }[] {
  const single = (i: number) => ({ parts: [i], ms: parts[i] });
  if (parts.length <= count) return parts.map((_, i) => single(i));
  const keepEnds = count >= 3 && parts.length >= 3;
  const from = keepEnds ? 1 : 0;
  const to = keepEnds ? parts.length - 1 : parts.length;
  const k = keepEnds ? count - 2 : count;
  const middle = split(parts.slice(from, to), k).map((g) => ({ parts: g.map((i) => i + from), ms: g.reduce((a, i) => a + parts[i + from], 0) }));
  return keepEnds ? [single(0), ...middle, single(parts.length - 1)] : middle;
}

/** Indexes of `values` cut into `k` contiguous runs with the least sum of squared run totals. */
function split(values: number[], k: number): number[][] {
  const n = values.length;
  const prefix = [0];
  for (const v of values) prefix.push(prefix[prefix.length - 1] + v);
  const sum = (a: number, b: number) => prefix[b] - prefix[a];
  // best[j][i]: least cost of cutting the first i values into j runs; cut[j][i]: where the last run starts.
  const best = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0][0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let i = j; i <= n; i++) {
      for (let c = j - 1; c < i; c++) {
        const cost = best[j - 1][c] + sum(c, i) ** 2;
        if (cost < best[j][i]) { best[j][i] = cost; cut[j][i] = c; }
      }
    }
  }
  const runs: number[][] = [];
  for (let j = k, i = n; j > 0; j--) {
    const c = cut[j][i];
    runs.unshift(Array.from({ length: i - c }, (_, x) => c + x));
    i = c;
  }
  return runs;
}

/** The one visual a project shows while its film is applied. */
export function filmLayer(src: string, shotsMs: number[]): VisualLayer {
  return { id: "film", type: "video", src, startMs: 0, endMs: shotsMs.reduce((a, b) => a + b, 0), fit: "cover", kenBurns: "none", opacity: 1, source: "film" };
}
