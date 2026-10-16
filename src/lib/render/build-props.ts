import type { Project, Script, Voiceover, Workspace } from "@prisma/client";
import { backgroundStyleSchema, captionStyleSchema, scenesSchema, visualLayersSchema, wordTimingSchema, parseJson, type WordTiming } from "@/lib/validations";
import { presetStyle } from "@/lib/captions/presets";
import { getTrack } from "@/lib/music/library";
import { estimateWordTimings } from "@/lib/captions/align";
import { absoluteUrl } from "@/lib/storage";
import { ASPECT_DIMENSIONS, type ShortVideoProps } from "@/lib/render/props";
import { alignLayersToScenes, applyBeatSync, timelineOffsetMs, type BeatGridSpec } from "@/lib/render/beat-grid";
import { z } from "zod";
import { readProjectFilm } from "@/lib/video-clips/film";

interface BuildArgs {
  project: Project;
  script: Script;
  voiceover: Voiceover | null;
  workspace: Workspace;
  resolution: "720p" | "1080p" | "4K";
  watermark: boolean;
  /** When true, relative storage URLs are made absolute (the render worker needs them). */
  absolute?: boolean;
  /**
   * The studio passes false and snaps in the browser instead: its music can
   * change between two renders of the same page, and the preview has to follow
   * that immediately rather than wait for a save and a reload.
   */
  snapCuts?: boolean;
}

/**
 * Does the project still play the track its tempo was measured from?
 *
 * The tempo is cleared whenever the music changes, so its mere presence is the
 * signal — but a project with no music at all must never inherit a stale grid.
 */
function musicIsPlaying(project: Project): boolean {
  return Boolean(project.musicUrl || project.musicTrackId);
}

/** How long a silent mini-film's hook and closing line stay on screen, and the bounds of a shot. */
const SILENT_HOOK_MS = 3000;
const SILENT_CTA_MS = 2500;
const SILENT_SHOT_MIN_MS = 2500;
const SILENT_SHOT_MAX_MS = 5000;

/**
 * A silent mini-film has no voice to time it, and its 2 to 6 words per shot
 * read in about a second: timed by reading speed, every shot lasted 1.4 s —
 * too short to see a gesture land, and a fifth of the 5-second animation
 * paid for it. Each shot lasts the length its script gives it instead
 * (durationSec, kept between 2.5 and 5 s), and its words show from the
 * shot's start.
 */
function silentStoryTiming(segments: string[], scenes: { durationSec: number }[], filmShotsMs: number[] | null): { words: WordTiming[]; totalMs: number } {
  // With a film on (lib/video-clips/film), each part lasts its shot, the closing line taking the end of the last one.
  const film = filmShotsMs && filmShotsMs.length === segments.length - 1 ? filmShotsMs : null;
  const filmCta = film ? Math.min(SILENT_CTA_MS, Math.round(film[film.length - 1] / 2)) : 0;
  const words: WordTiming[] = [];
  let start = 0;
  segments.forEach((text, i) => {
    const last = i === segments.length - 1;
    const planned = film
      ? last ? filmCta : i === film.length - 1 ? film[i] - filmCta : film[i]
      : i === 0 ? SILENT_HOOK_MS : last ? SILENT_CTA_MS : Math.min(SILENT_SHOT_MAX_MS, Math.max(SILENT_SHOT_MIN_MS, (scenes[i - 1]?.durationSec ?? 0) * 1000));
    // The estimate opens with a quarter-second lead-in: a part starts with its first word, so the words start with the part.
    const own = estimateWordTimings(text, [0]).map((w) => ({ ...w, startMs: w.startMs - 250 + start, endMs: w.endMs - 250 + start, sceneIndex: i }));
    words.push(...own);
    start = film ? start + planned : Math.max(start + planned, (own.at(-1)?.endMs ?? start) + 400);
  });
  return { words, totalMs: start };
}

/** Assemble the exact composition props for preview or rendering. Pure and deterministic. */
export function buildShortVideoProps({ project, script, voiceover, workspace, resolution, watermark, absolute = false, snapCuts = true }: BuildArgs): ShortVideoProps {
  const scenes = parseJson(scenesSchema, script.scenes, []);
  const segments = [script.hook, ...scenes.map((s) => s.text), script.callToAction].map((t) => t.trim()).filter(Boolean);

  let words: WordTiming[] = parseJson(z.array(wordTimingSchema), voiceover?.wordTimings, []);
  // A silent mini-film without a voice-over: each shot keeps its planned length.
  const silent = !words.length && script.story && !script.storyNarrated ? silentStoryTiming(segments, scenes, readProjectFilm(project.film)?.shotsMs ?? null) : null;
  if (silent) words = silent.words;
  if (!words.length) {
    const boundaries: number[] = [];
    let cursor = 0;
    for (const seg of segments) {
      boundaries.push(cursor);
      cursor += seg.split(/\s+/).filter(Boolean).length;
    }
    words = estimateWordTimings(segments.join(" "), boundaries);
  }

  const lastEnd = words.length ? words[words.length - 1].endMs : 3000;
  const durationMs = silent ? silent.totalMs : Math.max(3000, (voiceover?.durationMs ?? lastEnd + 400) + 600);

  const sceneRanges = segments.map((text, index) => {
    const ws = words.filter((w) => w.sceneIndex === index);
    const startMs = ws.length ? ws[0].startMs : 0;
    const endMs = ws.length ? ws[ws.length - 1].endMs : startMs;
    const meta = index === 0 || index === segments.length - 1 ? null : scenes[index - 1];
    return { index, text, startMs, endMs, onScreenText: meta?.onScreenText ?? null, emphasis: meta?.emphasis ?? [] };
  });
  // Stretch scene ranges so they tile the whole timeline.
  for (let i = 0; i < sceneRanges.length; i++) {
    if (i === 0) sceneRanges[i].startMs = 0;
    sceneRanges[i].endMs = i < sceneRanges.length - 1 ? sceneRanges[i + 1].startMs : durationMs;
  }

  // Put the cuts on the beat, when the track has one and the project wants it.
  // Boundaries move by under a fifth of a second, so the narration still lands
  // on its own scene; visual layers follow the boundary they were cut to.
  const beatGrid: BeatGridSpec | null =
    project.beatSync && project.musicBpm && musicIsPlaying(project)
      ? { bpm: project.musicBpm, offsetMs: timelineOffsetMs(project.musicBeatOffsetMs ?? 0, project.musicStartMs, project.musicBpm) }
      : null;


  const captionStyle = parseJson(captionStyleSchema, project.captionStyle, presetStyle(workspace.captionPreset, workspace.captionPosition));
  const rawLayers = parseJson(visualLayersSchema, project.visualLayers, []).map((l) => ({ ...l, src: l.src && absolute ? absoluteUrl(l.src) : l.src }));
  const synced = applyBeatSync(sceneRanges, alignLayersToScenes(rawLayers, sceneRanges), snapCuts ? beatGrid : null, durationMs);
  const visualLayers = synced.layers;
  const backgroundStyle = parseJson(backgroundStyleSchema, project.backgroundStyle, { type: "gradient", colors: [workspace.primaryColor, "#0B0714"], vignette: true, grain: true });

  const [width, height] = ASPECT_DIMENSIONS[project.aspectRatio][resolution];
  const track = getTrack(project.musicTrackId ?? workspace.defaultMusicId);
  const musicSrc = project.musicUrl || track?.url || null;
  const musicUrl = musicSrc ? (absolute ? absoluteUrl(musicSrc) : musicSrc) : null;
  const voiceoverUrl = voiceover?.audioUrl ? (absolute ? absoluteUrl(voiceover.audioUrl) : voiceover.audioUrl) : null;

  return {
    title: project.title,
    fps: 30,
    width,
    height,
    durationMs,
    voiceoverUrl,
    musicUrl,
    musicVolume: project.musicVolume,
    musicStartMs: project.musicStartMs,
    beatGrid: musicUrl ? beatGrid : null,
    // Captions turned off: no words at all, so even a render bundle older than the
    // `enabled` switch draws none.
    words: captionStyle.enabled === false ? [] : words,
    scenes: synced.scenes,
    captionStyle,
    visualLayers,
    backgroundStyle,
    watermark: watermark
      ? { text: "vidisprint.com", imageUrl: null, position: "bottom-right", opacity: 0.85 }
      : workspace.watermarkUrl
        ? { text: null, imageUrl: absolute ? absoluteUrl(workspace.watermarkUrl) : workspace.watermarkUrl, position: workspace.watermarkPosition, opacity: workspace.watermarkOpacity }
        : null,
    brand: { primaryColor: workspace.primaryColor, accentColor: workspace.accentColor, fontFamily: workspace.fontFamily },
  };
}
