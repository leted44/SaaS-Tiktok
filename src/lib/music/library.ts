export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  mood: "upbeat" | "chill" | "epic" | "dramatic" | "lofi" | "corporate";
  bpm: number;
  durationMs: number;
  url: string;
  premium: boolean;
}

/**
 * Royalty-free background library. URLs point at the app's own /public/music
 * folder so operators can drop in licensed tracks; entries with empty URLs are
 * listed but disabled until a file is provided.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  { id: "none", name: "No music", artist: "—", mood: "chill", bpm: 0, durationMs: 0, url: "", premium: false },
  { id: "momentum", name: "Momentum", artist: "ClipForge Library", mood: "upbeat", bpm: 124, durationMs: 92000, url: "/music/momentum.mp3", premium: false },
  { id: "nightdrive", name: "Night Drive", artist: "ClipForge Library", mood: "lofi", bpm: 88, durationMs: 105000, url: "/music/nightdrive.mp3", premium: false },
  { id: "ascend", name: "Ascend", artist: "ClipForge Library", mood: "epic", bpm: 110, durationMs: 98000, url: "/music/ascend.mp3", premium: true },
  { id: "tension", name: "Tension", artist: "ClipForge Library", mood: "dramatic", bpm: 96, durationMs: 88000, url: "/music/tension.mp3", premium: true },
  { id: "cleanslate", name: "Clean Slate", artist: "ClipForge Library", mood: "corporate", bpm: 100, durationMs: 120000, url: "/music/cleanslate.mp3", premium: false },
];

export const MUSIC_BY_ID = Object.fromEntries(MUSIC_TRACKS.map((t) => [t.id, t])) as Record<string, MusicTrack>;

export function getTrack(id: string | null | undefined): MusicTrack | null {
  if (!id || id === "none") return null;
  return MUSIC_BY_ID[id] ?? null;
}
