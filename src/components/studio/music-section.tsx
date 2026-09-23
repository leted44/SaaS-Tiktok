"use client";

import { useRef, useState } from "react";
import { Play, Lock, Upload, Trash2, Activity } from "lucide-react";
import { toast } from "sonner";
import { uploadAsset } from "@/lib/assets/upload-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { MOOD_LABELS } from "@/lib/music/library";
import { cn, formatDuration } from "@/lib/utils";
import { detectBeatGrid, detectBeatGridFromUrl, type BeatGrid } from "@/lib/audio/beats";

export interface MusicTrackOption {
  id: string;
  name: string;
  mood: string;
  url: string;
  premium: boolean;
}

export interface MusicSectionProps {
  musicTrackId: string | null;
  musicUrl: string | null;
  musicName: string | null;
  musicVolume: number;
  musicStartMs: number;
  musicBpm: number | null;
  beatSync: boolean;
  tracks: MusicTrackOption[];
  premiumAllowed: boolean;
  onMusicChange: (id: string | null, grid: BeatGrid | null) => void;
  onCustomMusicChange: (url: string | null, name: string | null, grid: BeatGrid | null) => void;
  onVolumeChange: (v: number) => void;
  onMusicStartChange: (v: number) => void;
  onBeatSyncChange: (v: boolean) => void;
}

/** One line naming the music a project or template plays. */
export function musicSummary(p: Pick<MusicSectionProps, "musicUrl" | "musicName" | "musicTrackId" | "tracks">): string {
  return p.musicUrl ? (p.musicName ?? "Ma musique") : (p.tracks.find((t) => t.id === p.musicTrackId)?.name ?? "Aucune");
}

/**
 * Background music: import your own file (tempo read in the browser), pick a
 * library track, set where it starts, its volume, and whether cuts land on the
 * beat. Shared by the studio and the autopilot template editor so a template
 * holds exactly what a hand-made video can.
 */
export function MusicSection(p: MusicSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [analysing, setAnalysing] = useState(false);
  const musicFileRef = useRef<HTMLInputElement>(null);
  const musicPlayerRef = useRef<HTMLAudioElement>(null);
  const [musicDurationMs, setMusicDurationMs] = useState<number | null>(null);
  const musicSource = p.musicUrl ?? p.tracks.find((t) => t.id === p.musicTrackId)?.url ?? null;
  // How late the start point may be set: enough of the track must remain that a
  // loop back to it doesn't restart within a couple of seconds of itself.
  const maxStartMs = musicDurationMs ? Math.max(0, musicDurationMs - 4000) : 0;

  /**
   * Read the tempo before uploading.
   *
   * The file is already in hand here, so analysing it costs one decode and no
   * network at all — and a track whose tempo is known arrives in the edit with
   * its cuts already on the beat, rather than needing a second pass.
   */
  async function analyse(source: File | string): Promise<BeatGrid | null> {
    setAnalysing(true);
    try {
      return typeof source === "string" ? await detectBeatGridFromUrl(source) : await detectBeatGrid(source);
    } catch {
      return null; // A track with no readable tempo is not an error: the edit just stays where it is.
    } finally {
      setAnalysing(false);
    }
  }

  function announce(grid: BeatGrid | null, imported: boolean) {
    if (grid) toast.success(`${imported ? "Musique importée · " : ""}Rythme détecté : ${Math.round(grid.bpm)} BPM — les coupures sont calées dessus.`);
    else if (imported) toast.success("Musique importée — elle est ajoutée au montage.");
    else toast.info("Aucun rythme net détecté sur ce morceau : les coupures restent inchangées.");
  }

  async function uploadMusic(file: File) {
    setUploading(true);
    setUploadPct(0);
    try {
      const grid = await analyse(file);
      const asset = await uploadAsset(file, { onProgress: (f) => setUploadPct(Math.round(f * 100)) });
      p.onCustomMusicChange(asset.url, asset.name, grid);
      announce(grid, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'envoi du fichier audio.");
    } finally {
      setUploading(false);
      if (musicFileRef.current) musicFileRef.current.value = "";
    }
  }

  /** Music chosen before beat sync existed has no tempo yet — this is how it gets one. */
  async function reanalyse() {
    if (!musicSource) return;
    const grid = await analyse(musicSource);
    if (p.musicUrl) p.onCustomMusicChange(p.musicUrl, p.musicName, grid);
    else p.onMusicChange(p.musicTrackId, grid);
    announce(grid, false);
  }

  async function pickTrack(id: string | null, url: string | null) {
    if (!id || !url) return p.onMusicChange(id, null);
    const grid = await analyse(url);
    p.onMusicChange(id, grid);
    announce(grid, false);
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" loading={uploading} onClick={() => musicFileRef.current?.click()}><Upload /> {uploading ? `${uploadPct} %` : "Importer un fichier"}</Button>
        <input ref={musicFileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadMusic(e.target.files[0])} />
      </div>

      {p.musicUrl && (
        <div className="mt-2 rounded-lg border border-primary/60 bg-primary/10 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.musicName ?? "Ma musique"}</span>
            <Button size="icon-sm" variant="ghost" aria-label="Retirer ma musique" onClick={() => p.onCustomMusicChange(null, null, null)}><Trash2 /></Button>
          </div>
          <audio
            ref={musicPlayerRef}
            controls
            src={p.musicUrl}
            className="mt-2 h-8 w-full"
            onLoadedMetadata={(e) => setMusicDurationMs(Math.round(e.currentTarget.duration * 1000))}
          />
          {musicDurationMs !== null && musicDurationMs > 8000 && (
            <div className="mt-2.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Point de départ</span>
                <span>{formatDuration(p.musicStartMs)} / {formatDuration(musicDurationMs)}</span>
              </div>
              <Slider
                value={[Math.min(p.musicStartMs, maxStartMs)]}
                min={0}
                max={maxStartMs}
                step={500}
                onValueChange={([v]) => {
                  p.onMusicStartChange(v);
                  if (musicPlayerRef.current) musicPlayerRef.current.currentTime = v / 1000;
                }}
              />
              <p className="text-[11px] text-muted-foreground">Passe l'intro : la vidéo joue le morceau à partir d'ici. Fais glisser puis appuie sur lecture pour écouter.</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {p.tracks.map((t) => {
          const locked = t.premium && !p.premiumAllowed;
          const missing = t.id !== "none" && !t.url;
          const selected = !p.musicUrl && (p.musicTrackId ?? "none") === t.id;
          return (
            <button key={t.id} type="button" disabled={locked || missing} onClick={() => pickTrack(t.id === "none" ? null : t.id, t.url ?? null)} className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
              <Play className={cn("h-3.5 w-3.5", selected ? "text-brand-300" : "text-muted-foreground")} />
              <span className="flex-1">{t.name} <span className="text-xs text-muted-foreground">· {MOOD_LABELS[t.mood as keyof typeof MOOD_LABELS] ?? t.mood}</span></span>
              {missing && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">indisponible</span>}
              {locked && !missing && <Lock className="h-3 w-3" />}
            </button>
          );
        })}
      </div>
      {p.tracks.some((t) => t.id !== "none" && !t.url) && (
        <p className="mt-2 text-[11px] text-muted-foreground">Les pistes marquées « indisponible » n'ont pas encore de fichier sous licence. Importez votre propre musique pour en ajouter une au montage.</p>
      )}
      {(p.musicUrl || p.musicTrackId) && (
        <>
          <div className="mt-3 space-y-2"><div className="flex justify-between"><Label>Volume musique</Label><span className="text-xs">{Math.round(p.musicVolume * 100)}%</span></div><Slider value={[p.musicVolume]} min={0} max={0.6} step={0.02} onValueChange={([v]) => p.onVolumeChange(v)} /></div>

          <div className="mt-3 rounded-lg border border-white/[0.06] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Activity className="h-3.5 w-3.5 shrink-0 text-brand-300" />
                <span className="min-w-0 text-sm">Caler les coupures sur le rythme</span>
              </span>
              <Switch checked={p.beatSync && Boolean(p.musicBpm)} disabled={!p.musicBpm} onCheckedChange={p.onBeatSyncChange} />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {analysing
                ? "Analyse du morceau en cours…"
                : p.musicBpm
                  ? `${Math.round(p.musicBpm)} BPM détectés. Les changements de plan se déplacent de quelques centièmes de seconde pour tomber sur le temps — la voix off, elle, ne bouge pas.`
                  : "Aucun rythme assez net n'a été détecté sur ce morceau. Les coupures restent là où elles sont."}
            </p>
            {!p.musicBpm && !analysing && musicSource && (
              <Button size="sm" variant="ghost" className="mt-1.5 h-7 px-2 text-[11px]" onClick={reanalyse}>
                <Activity /> Analyser le rythme
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
