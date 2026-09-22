/**
 * Placing cuts on the beat.
 *
 * A scene boundary is where the narration for the next scene starts, so it
 * cannot be moved freely — the voice would end up over the wrong visual. What
 * it can take is a nudge: shifting a b-roll change by under a fifth of a second
 * is imperceptible against speech, and is the difference between cuts that
 * happen to land anywhere and cuts that land with the music.
 *
 * So nothing here rewrites the edit. Each interior boundary looks for a beat
 * close enough to be worth moving to, takes it if one exists, and stays exactly
 * where it was if none does.
 */

export interface BeatGridSpec {
  bpm: number;
  offsetMs: number;
}

/** Never let a nudge produce a scene shorter than this. */
const MIN_SCENE_MS = 600;
/** The furthest a cut may travel, whatever the tempo. */
const MAX_TOLERANCE_MS = 180;
/**
 * …and never more than this share of one beat. On fast music beats are dense,
 * and a tolerance approaching half a period would snap every boundary
 * regardless of whether it was near a beat at all.
 */
const TOLERANCE_RATIO = 0.35;

export const beatPeriodMs = (bpm: number) => 60_000 / bpm;

export function snapTolerance(bpm: number): number {
  return Math.min(MAX_TOLERANCE_MS, beatPeriodMs(bpm) * TOLERANCE_RATIO);
}

/** The beat nearest `ms`, or null if the grid has none at or after zero. */
export function nearestBeat(ms: number, grid: BeatGridSpec): number | null {
  const period = beatPeriodMs(grid.bpm);
  if (!(period > 0)) return null;
  const n = Math.round((ms - grid.offsetMs) / period);
  const candidates = [n - 1, n, n + 1]
    .map((k) => grid.offsetMs + k * period)
    .filter((b) => b >= 0);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (Math.abs(b - ms) < Math.abs(a - ms) ? b : a));
}

/**
 * Nudge scene boundaries onto the beat.
 *
 * `boundaries` is the start of every scene, ascending, beginning at 0. The
 * first never moves (a video starts when it starts) and neither does the end of
 * the last scene, which is the end of the video.
 *
 * Returns a boundary list of the same length: each entry is either its original
 * value or a beat within tolerance of it, and the sequence is guaranteed to
 * stay ascending with scenes no shorter than MIN_SCENE_MS. A boundary whose
 * snap would violate either guarantee keeps its original value rather than
 * dragging its neighbours along.
 */
export function snapBoundaries(boundaries: number[], grid: BeatGridSpec, durationMs: number): number[] {
  if (boundaries.length < 2) return [...boundaries];
  const tolerance = snapTolerance(grid.bpm);
  const out = [...boundaries];

  for (let i = 1; i < out.length; i++) {
    const original = boundaries[i];
    const beat = nearestBeat(original, grid);
    if (beat === null || Math.abs(beat - original) > tolerance) continue;

    // Round first, then check: validating the unrounded beat and storing the
    // rounded one lets the rounding carry it back across a limit that had just
    // been verified — by well under a millisecond, but the guarantee is either
    // exact or it is not one.
    const snapped = Math.round(beat);

    // The previous boundary may already have moved; the next has not yet.
    const floor = out[i - 1] + MIN_SCENE_MS;
    const ceiling = (i + 1 < boundaries.length ? boundaries[i + 1] : durationMs) - MIN_SCENE_MS;
    if (snapped < floor || snapped > ceiling) continue;

    out[i] = snapped;
  }
  return out;
}

/** How many boundaries `snapBoundaries` actually moved — for telling the user what it did. */
export function countSnapped(before: number[], after: number[]): number {
  return before.reduce((n, b, i) => (after[i] !== b ? n + 1 : n), 0);
}

export interface TimedRange {
  startMs: number;
  endMs: number;
}

/**
 * Apply the grid to a whole edit: scenes and the visuals cut to them.
 *
 * One implementation, two callers — the studio runs it on every keystroke so
 * the preview reacts the moment the music changes, and the props builder runs
 * it on the way to a render. Both must agree exactly, so neither owns a copy.
 *
 * Layers move only if one of their edges sits on a scene boundary. A visual the
 * user positioned by hand is not on the grid and is left alone.
 */
export function applyBeatSync<S extends TimedRange, L extends TimedRange>(
  scenes: S[],
  layers: L[],
  grid: BeatGridSpec | null,
  durationMs: number,
): { scenes: S[]; layers: L[]; moved: number } {
  if (!grid || scenes.length < 2) return { scenes, layers, moved: 0 };

  const before = scenes.map((s) => s.startMs);
  const after = snapBoundaries(before, grid, durationMs);
  const moved = countSnapped(before, after);
  if (moved === 0) return { scenes, layers, moved: 0 };

  const shift = new Map<number, number>();
  before.forEach((b, i) => {
    if (after[i] !== b) shift.set(b, after[i]);
  });

  return {
    scenes: scenes.map((s, i) => ({
      ...s,
      startMs: after[i],
      endMs: i < scenes.length - 1 ? after[i + 1] : durationMs,
    })),
    layers: layers.map((l) => ({
      ...l,
      startMs: shift.get(l.startMs) ?? l.startMs,
      endMs: shift.get(l.endMs) ?? l.endMs,
    })),
    moved,
  };
}
