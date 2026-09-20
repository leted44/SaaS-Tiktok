"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic2, Music2, Lock, Wand2, CheckCircle2, Play, Pause, Loader2, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { generateVoiceoverAction } from "@/server/actions/voiceover";
import type { StudioProps, StudioVoiceover } from "@/components/studio/types";
import { MOOD_LABELS } from "@/lib/music/library";
import { languageLabel, VOICE_PREVIEW_TEXT } from "@/lib/tts/voices";
import { useVoicePreview } from "@/lib/tts/use-voice-preview";
import { VoiceCloneCard } from "@/components/studio/voice-clone";
import { cn, formatDuration, relativeTime } from "@/lib/utils";

interface Props {
  projectId: string;
  scriptId: string | null;
  voiceover: StudioVoiceover | null;
  voiceId: string | null;
  musicTrackId: string | null;
  musicUrl: string | null;
  musicName: string | null;
  musicVolume: number;
  voices: StudioProps["voices"];
  customVoice: { name: string; sampleUrl: string } | null;
  voiceCloningAllowed: boolean;
  voiceCloneCost: number;
  tracks: StudioProps["tracks"];
  /** Sample line read by the preview — the project's own hook when it has one. */
  previewText: string;
  premiumAllowed: boolean;
  ttsConfigured: boolean;
  estimatedDurationSec: number;
  costPer30s: number;
  credits: number;
  onVoiceChange: (id: string) => void;
  onCustomVoiceChange: () => void;
  onMusicChange: (id: string | null) => void;
  onCustomMusicChange: (url: string | null, name: string | null) => void;
  onVolumeChange: (v: number) => void;
}

export function AudioPanel(p: Props) {
  const router = useRouter();
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const musicFileRef = useRef<HTMLInputElement>(null);
  // The preview endpoint caps the sample at 300 characters.
  const preview = useVoicePreview(p.previewText.trim().slice(0, 280) || VOICE_PREVIEW_TEXT, speed);
  const estCost = Math.max(p.costPer30s, Math.ceil((p.estimatedDurationSec / speed) / 30) * p.costPer30s);
  const stale = p.voiceover && p.voiceover.voiceId !== p.voiceId;

  async function uploadMusic(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
    setUploading(false);
    if (musicFileRef.current) musicFileRef.current.value = "";
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return toast.error(body.error ?? "Échec de l'envoi du fichier audio.");
    }
    const { asset } = (await res.json()) as { asset: { url: string; name: string } };
    p.onCustomMusicChange(asset.url, asset.name);
    toast.success("Musique importée — elle est ajoutée au montage.");
  }

  async function generate() {
    if (!p.scriptId) return toast.error("Générez d'abord un script.");
    if (!p.voiceId) return toast.error("Choisissez une voix.");
    setLoading(true);
    const res = await generateVoiceoverAction({ projectId: p.projectId, scriptId: p.scriptId, voiceId: p.voiceId, stability, similarity: 0.75, speed });
    setLoading(false);
    if (!res.ok) return toast.error(res.error, { action: res.code === "INSUFFICIENT_CREDITS" ? { label: "Obtenir des crédits", onClick: () => router.push("/billing") } : undefined });
    toast.success(`Voix off prête (${formatDuration(res.data.durationMs)}) · ${res.data.creditsCharged} crédits`, { description: res.data.provider === "offline" ? "Mode hors ligne : piste silencieuse avec timing estimé." : undefined });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between"><Label className="inline-flex items-center gap-1"><Mic2 className="h-3 w-3" /> Voix</Label><Link href="/voices" className="text-[11px] text-muted-foreground hover:text-foreground">Catalogue complet →</Link></div>
        <div className="mt-2 space-y-1.5">
          {p.voices.map((v, i) => {
            const locked = v.premium && !p.premiumAllowed;
            const selected = p.voiceId === v.id;
            const active = preview.playing === v.id;
            const newGroup = i === 0 || p.voices[i - 1].language !== v.language;
            return (
              <div key={v.id}>
                {newGroup && (
                  <p className={cn("mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", i > 0 && "mt-3")}>
                    {languageLabel(v.language)}
                    <span className="h-px flex-1 bg-white/[0.06]" />
                  </p>
                )}
                <div className={cn("flex items-center gap-2 rounded-lg border p-2 transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                  <button type="button" onClick={() => (locked ? toast.error(`${v.name} est une voix Pro. Écoutez-la puis passez à un forfait supérieur pour l'utiliser.`) : p.onVoiceChange(v.id))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white", locked && "opacity-60", v.gender === "female" ? "bg-gradient-to-br from-pink-500 to-purple-600" : "bg-gradient-to-br from-indigo-500 to-cyan-500")}>{v.name[0]}</span>
                    <span className={cn("min-w-0", locked && "opacity-60")}>
                      <span className="block truncate text-sm font-medium">{v.name} {locked && <Lock className="inline h-3 w-3" />}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{v.style}</span>
                    </span>
                  </button>
                  <Button size="icon-sm" variant={active ? "default" : "ghost"} aria-label={`Écouter ${v.name}`} disabled={preview.loadingId === v.id} onClick={() => preview.toggle(v.id)}>
                    {preview.loadingId === v.id ? <Loader2 className="animate-spin" /> : active ? <Pause /> : <Play />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Toutes les voix sont écoutables, y compris les voix Pro.</p>
      </div>

      <VoiceCloneCard customVoice={p.customVoice} allowed={p.voiceCloningAllowed} cost={p.voiceCloneCost} credits={p.credits} onChange={p.onCustomVoiceChange} />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><div className="flex justify-between"><Label>Stabilité</Label><span className="text-xs">{Math.round(stability * 100)}%</span></div><Slider value={[stability]} min={0} max={1} step={0.05} onValueChange={([v]) => setStability(v)} /></div>
        <div className="space-y-2"><div className="flex justify-between"><Label>Vitesse</Label><span className="text-xs">{speed.toFixed(2)}×</span></div><Slider value={[speed]} min={0.7} max={1.3} step={0.05} onValueChange={([v]) => setSpeed(v)} /></div>
      </div>

      <div className="surface p-3">
        {p.voiceover?.audioUrl ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Voix off · {p.voiceover.durationMs ? formatDuration(p.voiceover.durationMs) : ""}</span>
              <span className="text-muted-foreground">{relativeTime(p.voiceover.createdAt)} {p.voiceover.provider === "offline" && <Badge variant="warning" className="ml-1">hors ligne</Badge>}</span>
            </div>
            <audio controls src={p.voiceover.audioUrl} className="h-8 w-full" />
            {stale && <p className="text-[11px] text-amber-300">Voix modifiée — régénérez pour appliquer.</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pas encore de voix off. Les sous-titres utilisent un timing estimé pour l'instant.</p>
        )}
        <Button className="mt-3 w-full" variant="gradient" onClick={generate} loading={loading} disabled={!p.scriptId}>
          <Wand2 /> {p.voiceover ? "Régénérer la voix off" : "Générer la voix off"} · {estCost} cr
        </Button>
        {!p.ttsConfigured && <p className="mt-2 text-[11px] text-amber-300">Clé ELEVENLABS_API_KEY manquante — le mode hors ligne génère une piste silencieuse avec timing estimé.</p>}
        {p.credits < estCost && <p className="mt-2 text-[11px] text-red-300">Crédits insuffisants ({p.credits}). <Link href="/billing" className="underline">Recharger</Link>.</p>}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="inline-flex items-center gap-1"><Music2 className="h-3 w-3" /> Musique de fond</Label>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" loading={uploading} onClick={() => musicFileRef.current?.click()}><Upload /> Importer un fichier</Button>
          <input ref={musicFileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadMusic(e.target.files[0])} />
        </div>

        {p.musicUrl && (
          <div className="mt-2 rounded-lg border border-primary/60 bg-primary/10 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.musicName ?? "Ma musique"}</span>
              <Button size="icon-sm" variant="ghost" aria-label="Retirer ma musique" onClick={() => p.onCustomMusicChange(null, null)}><Trash2 /></Button>
            </div>
            <audio controls src={p.musicUrl} className="mt-2 h-8 w-full" />
          </div>
        )}

        <div className="mt-2 space-y-1.5">
          {p.tracks.map((t) => {
            const locked = t.premium && !p.premiumAllowed;
            const missing = t.id !== "none" && !t.url;
            const selected = !p.musicUrl && (p.musicTrackId ?? "none") === t.id;
            return (
              <button key={t.id} type="button" disabled={locked || missing} onClick={() => p.onMusicChange(t.id === "none" ? null : t.id)} className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
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
          <div className="mt-3 space-y-2"><div className="flex justify-between"><Label>Volume musique</Label><span className="text-xs">{Math.round(p.musicVolume * 100)}%</span></div><Slider value={[p.musicVolume]} min={0} max={0.6} step={0.02} onValueChange={([v]) => p.onVolumeChange(v)} /></div>
        )}
      </div>
    </div>
  );
}
