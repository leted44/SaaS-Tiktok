"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Lock, Search, Music2, Volume2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import type { VoiceDefinition } from "@/lib/tts/voices";
import type { MusicTrack } from "@/lib/music/library";
import { MOOD_LABELS } from "@/lib/music/library";
import { VOICE_PREVIEW_TEXT } from "@/lib/tts/voices";
import { cn, formatDuration } from "@/lib/utils";

export function VoiceCatalog({ voices, tracks, premiumAllowed, ttsConfigured }: { voices: VoiceDefinition[]; tracks: MusicTrack[]; premiumAllowed: boolean; ttsConfigured: boolean }) {
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [text, setText] = useState(VOICE_PREVIEW_TEXT);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<Map<string, string>>(new Map());

  useEffect(() => () => { audioRef.current?.pause(); cache.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  async function preview(voice: VoiceDefinition) {
    if (voice.premium && !premiumAllowed) return toast.error(`${voice.name} est une voix premium. Passez à un forfait supérieur pour la débloquer.`);
    if (playing === voice.id) { audioRef.current?.pause(); setPlaying(null); return; }
    audioRef.current?.pause();
    const key = `${voice.id}:${speed}:${text}`;
    let url = cache.current.get(key);
    if (!url) {
      setLoadingId(voice.id);
      const res = await fetch("/api/voice/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voiceId: voice.id, text, speed }) });
      setLoadingId(null);
      if (!res.ok) { const j = await res.json().catch(() => ({})); return toast.error(j.error ?? "Échec de l'aperçu"); }
      if (res.headers.get("x-tts-provider") === "offline") toast.info("Synthèse vocale non configurée — lecture d'un espace réservé silencieux avec timing estimé.");
      url = URL.createObjectURL(await res.blob());
      cache.current.set(key, url);
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    await audio.play();
    setPlaying(voice.id);
  }

  const filtered = voices.filter((v) => (gender === "all" || v.gender === gender) && `${v.name} ${v.style} ${v.accent} ${v.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Tabs defaultValue="voices">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="voices"><Volume2 /> Voix IA</TabsTrigger>
          <TabsTrigger value="music"><Music2 /> Bibliothèque musicale</TabsTrigger>
        </TabsList>
        {!ttsConfigured && <Badge variant="warning">Clé ElevenLabs manquante — mode hors ligne</Badge>}
      </div>

      <TabsContent value="voices" className="space-y-4">
        <div className="surface grid gap-4 p-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Texte d'essai</label>
            <Input value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder="Tapez une phrase pour l'entendre dans chaque voix" />
          </div>
          <div className="w-full space-y-1.5 md:w-48">
            <div className="flex justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground"><span>Vitesse</span><span className="text-foreground">{speed.toFixed(2)}×</span></div>
            <Slider value={[speed]} min={0.7} max={1.3} step={0.05} onValueChange={([v]) => setSpeed(v)} className="mt-3" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom, style ou tag" className="pl-9" />
          </div>
          {([["all", "Toutes"], ["female", "Femme"], ["male", "Homme"]] as const).map(([g, label]) => (
            <button key={g} onClick={() => setGender(g)} className={cn("rounded-full border px-3 py-1 text-xs transition", gender === g ? "border-primary/60 bg-primary/15" : "border-white/10 text-muted-foreground hover:text-foreground")}>{label}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v, i) => {
            const locked = v.premium && !premiumAllowed;
            const active = playing === v.id;
            return (
              <motion.div key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className={cn("surface group relative p-4 transition-all hover:border-primary/30", active && "border-primary/50 shadow-glow-sm")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl font-display text-lg font-bold text-white", v.gender === "female" ? "bg-gradient-to-br from-pink-500 to-purple-600" : "bg-gradient-to-br from-indigo-500 to-cyan-500")}>{v.name[0]}</div>
                    <div>
                      <p className="font-semibold">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.accent} · {v.style}</p>
                    </div>
                  </div>
                  {v.premium ? <Badge variant={locked ? "secondary" : "gradient"}>{locked ? <><Lock className="h-3 w-3" /> Pro</> : "Premium"}</Badge> : <Badge variant="secondary">Gratuit</Badge>}
                </div>
                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{v.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">{v.tags.map((t) => <span key={t} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>)}</div>
                <div className="mt-4 flex items-center gap-2">
                  <Button size="sm" variant={active ? "default" : "secondary"} onClick={() => preview(v)} disabled={loadingId === v.id} className="flex-1">
                    {loadingId === v.id ? <Loader2 className="animate-spin" /> : active ? <Pause /> : <Play />} {active ? "Arrêter" : "Écouter"}
                  </Button>
                </div>
                {active && (
                  <div className="mt-3 flex h-6 items-end justify-center gap-0.5">
                    {Array.from({ length: 24 }).map((_, k) => (
                      <motion.span key={k} className="w-1 rounded-full bg-brand-gradient" animate={{ height: [4, 6 + ((k * 7) % 18), 4] }} transition={{ duration: 0.5 + (k % 5) * 0.1, repeat: Infinity }} />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </TabsContent>

      <TabsContent value="music">
        <MusicList tracks={tracks} premiumAllowed={premiumAllowed} />
      </TabsContent>
    </Tabs>
  );
}

function MusicList({ tracks, premiumAllowed }: { tracks: MusicTrack[]; premiumAllowed: boolean }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audioRef.current?.pause(), []);
  function toggle(t: MusicTrack) {
    if (!t.url) return;
    if (t.premium && !premiumAllowed) return toast.error("Piste premium — passez à un forfait supérieur pour la débloquer.");
    if (playing === t.id) { audioRef.current?.pause(); setPlaying(null); return; }
    audioRef.current?.pause();
    const a = new Audio(t.url);
    a.volume = 0.6;
    a.onended = () => setPlaying(null);
    a.onerror = () => { toast.error("Fichier de piste manquant dans /public/music"); setPlaying(null); };
    a.play().catch(() => undefined);
    audioRef.current = a;
    setPlaying(t.id);
  }
  return (
    <div className="surface divide-y divide-white/[0.05]">
      {tracks.filter((t) => t.id !== "none").map((t) => (
        <div key={t.id} className="flex items-center gap-4 px-4 py-3">
          <Button size="icon" variant={playing === t.id ? "default" : "secondary"} onClick={() => toggle(t)}>{playing === t.id ? <Pause /> : <Play />}</Button>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t.name}</p>
            <p className="text-xs text-muted-foreground">{t.artist} · {MOOD_LABELS[t.mood]} · {t.bpm} BPM · {formatDuration(t.durationMs)}</p>
          </div>
          {t.premium ? <Badge variant="gradient">Premium</Badge> : <Badge variant="secondary">Gratuit</Badge>}
        </div>
      ))}
      <p className="px-4 py-3 text-xs text-muted-foreground">Déposez des fichiers MP3 sous licence dans <code>/public/music</code> en respectant les identifiants de piste pour activer la lecture et le rendu.</p>
    </div>
  );
}
