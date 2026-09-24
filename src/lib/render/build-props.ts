import type { Project, Script, Voiceover, Workspace } from "@prisma/client";
import { backgroundStyleSchema, captionStyleSchema, scenesSchema, visualLayersSchema, wordTimingSchema, parseJson, type WordTiming } from "@/lib/validations";
import { presetStyle } from "@/lib/captions/presets";
import { getTrack } from "@/lib/music/library";
import { estimateWordTimings } from "@/lib/captions/align";
import { absoluteUrl } from "@/lib/storage";
import { ASPECT_DIMENSIONS, type ShortVideoProps } from "@/lib/render/props";
import { applyBeatSync, timelineOffsetMs, type BeatGridSpec } from "@/lib/render/beat-grid";
import { z } from "zod";

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

/** Assemble the exact composition props for preview or rendering. Pure and deterministic. */
export function buildShortVideoProps({ project, script, voiceover, workspace, resolution, watermark, absolute = false, snapCuts = true }: BuildArgs): ShortVideoProps {
  const scenes = parseJson(scenesSchema, script.scenes, []);
  const segments = [script.hook, ...scenes.map((s) => s.text), script.callToAction].map((t) => t.trim()).filter(Boolean);

  let words: WordTiming[] = parseJson(z.array(wordTimingSchema), voiceover?.wordTimings, []);
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
  const durationMs = Math.max(3000, (voiceover?.durationMs ?? lastEnd + 400) + 600);

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
  const synced = applyBeatSync(sceneRanges, rawLayers, snapCuts ? beatGrid : null, durationMs);
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
    words,
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
