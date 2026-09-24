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
  { id: "none", name: "Aucune musique", artist: "—", mood: "chill", bpm: 0, durationMs: 0, url: "", premium: false },
  // No licensed audio files are bundled yet — url stays empty (renders silently)
  // until real tracks are dropped into /public/music.
  { id: "momentum", name: "Momentum", artist: "Bibliothèque VidiSprint", mood: "upbeat", bpm: 124, durationMs: 92000, url: "", premium: false },
  { id: "nightdrive", name: "Night Drive", artist: "Bibliothèque VidiSprint", mood: "lofi", bpm: 88, durationMs: 105000, url: "", premium: false },
  { id: "ascend", name: "Ascend", artist: "Bibliothèque VidiSprint", mood: "epic", bpm: 110, durationMs: 98000, url: "", premium: true },
  { id: "tension", name: "Tension", artist: "Bibliothèque VidiSprint", mood: "dramatic", bpm: 96, durationMs: 88000, url: "", premium: true },
  { id: "cleanslate", name: "Clean Slate", artist: "Bibliothèque VidiSprint", mood: "corporate", bpm: 100, durationMs: 120000, url: "", premium: false },
];

export const MUSIC_BY_ID = Object.fromEntries(MUSIC_TRACKS.map((t) => [t.id, t])) as Record<string, MusicTrack>;

export function getTrack(id: string | null | undefined): MusicTrack | null {
  if (!id || id === "none") return null;
  return MUSIC_BY_ID[id] ?? null;
}

export const MOOD_LABELS: Record<MusicTrack["mood"], string> = {
  upbeat: "entraînant",
  chill: "détendu",
  epic: "épique",
  dramatic: "dramatique",
  lofi: "lofi",
  corporate: "corporate",
};
