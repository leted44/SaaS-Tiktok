"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic2, Music2, Lock, Wand2, CheckCircle2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { generateVoiceoverAction } from "@/server/actions/voiceover";
import type { StudioProps, StudioVoiceover } from "@/components/studio/types";
import { MOOD_LABELS } from "@/lib/music/library";
import { cn, formatDuration, relativeTime } from "@/lib/utils";

interface Props {
  projectId: string;
  scriptId: string | null;
  voiceover: StudioVoiceover | null;
  voiceId: string | null;
  musicTrackId: string | null;
  musicVolume: number;
  voices: StudioProps["voices"];
  tracks: StudioProps["tracks"];
  premiumAllowed: boolean;
  ttsConfigured: boolean;
  estimatedDurationSec: number;
  costPer30s: number;
  credits: number;
  onVoiceChange: (id: string) => void;
  onMusicChange: (id: string | null) => void;
  onVolumeChange: (v: number) => void;
}

export function AudioPanel(p: Props) {
  const router = useRouter();
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const estCost = Math.max(p.costPer30s, Math.ceil((p.estimatedDurationSec / speed) / 30) * p.costPer30s);
  const stale = p.voiceover && p.voiceover.voiceId !== p.voiceId;

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
        <div className="flex items-center justify-between"><Label className="inline-flex items-center gap-1"><Mic2 className="h-3 w-3" /> Voix</Label><Link href="/voices" className="text-[11px] text-muted-foreground hover:text-foreground">Tout écouter →</Link></div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {p.voices.map((v) => {
            const locked = v.premium && !p.premiumAllowed;
            return (
              <button key={v.id} type="button" disabled={locked} onClick={() => p.onVoiceChange(v.id)} className={cn("flex items-center gap-2 rounded-lg border p-2 text-left transition disabled:opacity-50", p.voiceId === v.id ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white", v.gender === "female" ? "bg-gradient-to-br from-pink-500 to-purple-600" : "bg-gradient-to-br from-indigo-500 to-cyan-500")}>{v.name[0]}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{v.name} {locked && <Lock className="inline h-3 w-3" />}</span><span className="block truncate text-[11px] text-muted-foreground">{v.style}</span></span>
              </button>
            );
          })}
        </div>
      </div>

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
        <Label className="inline-flex items-center gap-1"><Music2 className="h-3 w-3" /> Musique de fond</Label>
        <div className="mt-2 space-y-1.5">
          {p.tracks.map((t) => {
            const locked = t.premium && !p.premiumAllowed;
            const selected = (p.musicTrackId ?? "none") === t.id;
            return (
              <button key={t.id} type="button" disabled={locked} onClick={() => p.onMusicChange(t.id === "none" ? null : t.id)} className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                <Play className={cn("h-3.5 w-3.5", selected ? "text-brand-300" : "text-muted-foreground")} />
                <span className="flex-1">{t.name} <span className="text-xs text-muted-foreground">· {MOOD_LABELS[t.mood as keyof typeof MOOD_LABELS] ?? t.mood}</span></span>
                {locked && <Lock className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
        {p.musicTrackId && (
          <div className="mt-3 space-y-2"><div className="flex justify-between"><Label>Volume musique</Label><span className="text-xs">{Math.round(p.musicVolume * 100)}%</span></div><Slider value={[p.musicVolume]} min={0} max={0.6} step={0.02} onValueChange={([v]) => p.onVolumeChange(v)} /></div>
        )}
      </div>
    </div>
  );
}
