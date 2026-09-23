"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, Captions, Check, Clapperboard, Copy, FileText, Image as ImageIcon, Layers, Loader2, Lock, Mic2, Monitor, Music2, Palette, Pause, Play, Save, Smartphone, Square, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PreviewPlayer } from "@/components/studio/preview-player";
import { CaptionsPanel } from "@/components/studio/captions-panel";
import { MusicSection, type MusicTrackOption } from "@/components/studio/music-section";
import { BackgroundControls } from "@/components/studio/background-controls";
import { saveTemplateAction, templateFromProjectAction } from "@/server/actions/autopilot";
import { useVoicePreview } from "@/lib/tts/use-voice-preview";
import { LANGUAGE_LABELS, languageLabel } from "@/lib/tts/voices";
import { RESOLUTIONS, ASPECTS, ASPECT_LABELS, TONES, TONE_LABELS, describeTemplate, sampleText, templateCost, templatePreviewProps, voiceLanguage, type Resolution, type TemplateInput } from "@/lib/autopilot/template-shared";
import type { CaptionStyle } from "@/lib/validations";
import { cn } from "@/lib/utils";

interface VoiceOption {
  id: string;
  name: string;
  style: string;
  gender: string;
  language: string;
  premium: boolean;
}

interface Props {
  templateId: string | null;
  initial: TemplateInput;
  isOnlyTemplate: boolean;
  copiedFrom: string | null;
  voices: VoiceOption[];
  customVoiceName: string | null;
  tracks: MusicTrackOption[];
  projects: { id: string; title: string }[];
  plan: { premiumVoices: boolean; maxResolution: Resolution; free: boolean };
  stockConfigured: boolean;
  brand: { primaryColor: string; accentColor: string; fontFamily: string };
}

const CONTENT_LANGUAGES = ["fr", "en", "es", "de", "it", "pt"];
const DURATIONS = [30, 45, 60, 90];
const RES_RANK: Record<Resolution, number> = { "720p": 0, "1080p": 1, "4K": 2 };
const POSITIONS: { value: CaptionStyle["position"]; label: string }[] = [
  { value: "top", label: "Haut" },
  { value: "center", label: "Centre" },
  { value: "bottom", label: "Bas" },
];
const ASPECT_ICONS = { VERTICAL: Smartphone, SQUARE: Square, HORIZONTAL: Monitor } as const;

function Block({ n, title, icon: Icon, hint, children }: { n: number; title: string; icon: typeof FileText; hint?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-brand-200">{n}</span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-brand-300" /> {title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function TemplateEditor({ templateId, initial, isOnlyTemplate, copiedFrom, voices, customVoiceName, tracks, projects, plan, stockConfigured, brand }: Props) {
  const router = useRouter();
  const [t, setT] = useState<TemplateInput>(initial);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [sampleVisual, setSampleVisual] = useState<{ url: string; type: "video" | "image" } | null>(null);
  const saved = useRef(JSON.stringify(initial));
  const dirty = JSON.stringify(t) !== saved.current;
  const set = <K extends keyof TemplateInput>(k: K, v: TemplateInput[K]) => setT((s) => ({ ...s, [k]: v }));

  const preview = useVoicePreview(sampleText(t.language).slice(0, 280), t.voiceSpeed);
  const previewProps = useMemo(() => templatePreviewProps(t, brand, sampleVisual), [t, brand, sampleVisual]);
  // Open on a moment with words on screen, so the caption style and position show before pressing play.
  const [captionFrame] = useState(() => {
    const p = templatePreviewProps(initial, brand, null);
    return (((p.words[3]?.startMs ?? 1200) + 150) / 1000) * p.fps;
  });
  const summary = describeTemplate(t, customVoiceName);
  const cost = templateCost(t, plan.maxResolution);
  const voiceLang = voiceLanguage(t.voiceId, t.language);
  const langMismatch = t.voiceId !== "custom" && voiceLang !== t.language.slice(0, 2);

  // One real stock clip in the preview, so "a clip per scene" is shown, not described.
  const fetchedVisual = useRef(false);
  useEffect(() => {
    if (!t.stockVisuals || !stockConfigured || fetchedVisual.current) return;
    fetchedVisual.current = true;
    fetch(`/api/stock/search?type=video&q=${encodeURIComponent("people city lifestyle")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { results?: { url: string; type: "video" | "image" }[] } | null) => {
        const first = d?.results?.[0];
        if (first) setSampleVisual({ url: first.url, type: first.type });
      })
      .catch(() => {});
  }, [t.stockVisuals, stockConfigured]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changeLanguage(language: string) {
    setT((s) => {
      const current = voices.find((v) => v.id === s.voiceId);
      if (s.voiceId === "custom" || !current || current.language === language) return { ...s, language };
      const replacement = voices.find((v) => v.language === language && (!v.premium || plan.premiumVoices));
      if (!replacement) return { ...s, language };
      toast.info(`Voix changée pour ${replacement.name}, qui parle ${languageLabel(language).toLowerCase()}.`);
      return { ...s, language, voiceId: replacement.id };
    });
  }

  async function copyFrom(projectId: string) {
    if (!projectId) return;
    if (dirty && !window.confirm("Remplacer les réglages actuels par ceux de cette vidéo ?")) return;
    setCopying(true);
    const res = await templateFromProjectAction(projectId);
    setCopying(false);
    if (!res.ok) return toast.error(res.error);
    setT((s) => ({ ...res.data, name: s.name, isDefault: s.isDefault }));
    toast.success("Style repris : voix, sous-titres, musique, fond et format.");
  }

  async function save() {
    setSaving(true);
    const res = await saveTemplateAction(templateId, t);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    saved.current = JSON.stringify(t);
    toast.success("Modèle enregistré.");
    router.push(`/autopilot?template=${res.data.id}`);
    router.refresh();
  }

  const voiceGroups = useMemo(() => {
    const groups: { language: string; items: VoiceOption[] }[] = [];
    for (const v of voices) {
      const g = groups.find((x) => x.language === v.language);
      if (g) g.items.push(v);
      else groups.push({ language: v.language, items: [v] });
    }
    return groups;
  }, [voices]);

  const saveButton = (
    <Button variant="gradient" className="w-full" loading={saving} onClick={save}>
      <Save /> {templateId ? "Enregistrer le modèle" : "Créer le modèle"}
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl pb-24 lg:pb-8">
      <div className="mb-5">
        <Link href="/autopilot" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Pilote automatique</Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">{templateId ? "Modifier le modèle" : "Nouveau modèle de vidéo"}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Chaque réglage ici est celui que tu ferais à la main dans le studio. Le pilote automatique les applique à chaque vidéo programmée avec ce modèle — l'aperçu montre le résultat.</p>
        {copiedFrom && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-brand-200"><Copy className="h-3 w-3" /> Style repris de « {copiedFrom} »</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Preview first on a phone: seeing the result is the point of the page. */}
        <aside className="space-y-3 lg:order-2 lg:sticky lg:top-24 lg:self-start">
          <div className="surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperçu</p>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={preview.loadingId === t.voiceId} onClick={() => preview.toggle(t.voiceId)}>
                {preview.loadingId === t.voiceId ? <Loader2 className="animate-spin" /> : preview.playing === t.voiceId ? <Pause /> : <Play />} Écouter la voix
              </Button>
            </div>
            <div className="flex justify-center">
              <PreviewPlayer inputProps={previewProps} initialFrame={captionFrame} className={cn("w-full", t.aspectRatio === "VERTICAL" ? "max-w-[230px]" : t.aspectRatio === "SQUARE" ? "max-w-[320px]" : "max-w-full")} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Texte d'exemple. Dans chaque vidéo, le script, la voix et {t.stockVisuals ? "les vidéos de chaque scène" : "le texte"} sont générés à partir du thème programmé.</p>
          </div>

          <div className="surface space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ce que produira ce modèle</p>
            <dl className="space-y-1.5 text-[12px]">
              {([
                [FileText, "Script", summary.content],
                [Mic2, "Voix", summary.voice],
                [Captions, "Sous-titres", summary.captions],
                [Music2, "Musique", summary.music],
                [Layers, "Visuels", summary.visuals],
                [Clapperboard, "Format", summary.format],
              ] as const).map(([Icon, label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</dt>
                  <dd className="min-w-0 flex-1">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-white/[0.06] pt-2 text-[11px] text-muted-foreground">{plan.free ? "Gratuit sur ton compte." : `≈ ${cost} crédits par vidéo (script, voix, rendu).`}</p>
            <div className="hidden pt-1 lg:block">{saveButton}</div>
            {dirty && <p className="hidden text-center text-[11px] text-amber-300 lg:block">Modifications non enregistrées</p>}
          </div>
        </aside>

        <div className="min-w-0 space-y-4 lg:order-1">
          <Block n={1} title="Nom du modèle" icon={Wand2} hint="Pour le reconnaître quand tu programmes une vidéo.">
            <Input value={t.name} maxLength={60} onChange={(e) => set("name", e.target.value)} placeholder="Ex. : Santé mentale — voix posée" />
            <label className={cn("mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2.5", (initial.isDefault || isOnlyTemplate) && "opacity-70")}>
              <span className="min-w-0">
                <span className="block text-sm">Modèle par défaut</span>
                <span className="block text-[11px] text-muted-foreground">Proposé en premier quand tu programmes une vidéo.</span>
              </span>
              <Switch checked={t.isDefault} disabled={initial.isDefault || isOnlyTemplate} onCheckedChange={(v) => set("isDefault", v)} />
            </label>
            {projects.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="tpl-from">Reprendre le style d'une de tes vidéos</Label>
                <div className="flex items-center gap-2">
                  <select id="tpl-from" defaultValue="" disabled={copying} onChange={(e) => { void copyFrom(e.target.value); e.target.value = ""; }} className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-transparent px-2 text-sm">
                    <option value="" className="bg-background">Choisir une vidéo…</option>
                    {projects.map((p) => <option key={p.id} value={p.id} className="bg-background">{p.title}</option>)}
                  </select>
                  {copying && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <p className="text-[11px] text-muted-foreground">Copie sa voix, ses sous-titres, sa musique (point de départ et rythme compris), son fond et son format.</p>
              </div>
            )}
          </Block>

          <Block n={2} title="Contenu" icon={FileText} hint="Ce que l'IA écrit. Durée et ton restent modifiables à chaque programmation.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-lang">Langue des vidéos</Label>
                <select id="tpl-lang" value={t.language} onChange={(e) => changeLanguage(e.target.value)} className="h-9 w-full rounded-md border border-white/10 bg-transparent px-2 text-sm">
                  {CONTENT_LANGUAGES.map((l) => <option key={l} value={l} className="bg-background">{LANGUAGE_LABELS[l] ?? l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Durée visée</Label>
                <div className="grid grid-cols-4 gap-1">
                  {DURATIONS.map((d) => (
                    <button key={d} type="button" onClick={() => set("targetDurationSec", d)} className={cn("rounded-md border py-1.5 text-xs transition", t.targetDurationSec === d ? "border-primary/60 bg-primary/10" : "border-white/10 text-muted-foreground hover:border-white/20")}>{d}s</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label>Ton</Label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((tone) => (
                  <button key={tone} type="button" onClick={() => set("tone", tone)} className={cn("rounded-full border px-3 py-1 text-xs transition", t.tone === tone ? "border-primary/60 bg-primary/10" : "border-white/10 text-muted-foreground hover:border-white/20")}>{TONE_LABELS[tone]}</button>
                ))}
              </div>
            </div>
          </Block>

          <Block n={3} title="Voix" icon={Mic2} hint="Qui lit le script. Écoute avant de choisir.">
            {langMismatch && (
              <p className="mb-3 flex gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Cette voix est {languageLabel(voiceLang).toLowerCase()} et tes vidéos sont en {languageLabel(t.language).toLowerCase()} : l'accent sera étranger.</p>
            )}
            <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
              {voiceGroups.map((g) => (
                <div key={g.language}>
                  <p className="mb-1 mt-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{languageLabel(g.language)}<span className="h-px flex-1 bg-white/[0.06]" /></p>
                  <div className="space-y-1.5">
                    {g.items.map((v) => {
                      const locked = v.premium && !plan.premiumVoices;
                      const selected = t.voiceId === v.id;
                      return (
                        <div key={v.id} className={cn("flex items-center gap-2 rounded-lg border p-2 transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                          <button type="button" disabled={locked} onClick={() => set("voiceId", v.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50">
                            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white", v.gender === "female" ? "bg-gradient-to-br from-pink-500 to-purple-600" : "bg-gradient-to-br from-indigo-500 to-cyan-500")}>{v.name[0]}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{v.name} {locked && <Lock className="inline h-3 w-3" />}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">{v.style}</span>
                            </span>
                            {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-brand-300" />}
                          </button>
                          <Button size="icon-sm" variant={preview.playing === v.id ? "default" : "ghost"} aria-label={`Écouter ${v.name}`} disabled={preview.loadingId === v.id} onClick={() => preview.toggle(v.id)}>
                            {preview.loadingId === v.id ? <Loader2 className="animate-spin" /> : preview.playing === v.id ? <Pause /> : <Play />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="space-y-2"><div className="flex justify-between"><Label>Vitesse</Label><span className="text-xs">{t.voiceSpeed.toFixed(2)}×</span></div><Slider value={[t.voiceSpeed]} min={0.7} max={1.3} step={0.05} onValueChange={([v]) => set("voiceSpeed", v)} /></div>
              <div className="space-y-2"><div className="flex justify-between"><Label>Stabilité</Label><span className="text-xs">{Math.round(t.voiceStability * 100)}%</span></div><Slider value={[t.voiceStability]} min={0} max={1} step={0.05} onValueChange={([v]) => set("voiceStability", v)} /></div>
            </div>
          </Block>

          <Block n={4} title="Sous-titres" icon={Captions} hint="Le style et la place du texte à l'écran.">
            <Label>Position du texte</Label>
            <div className="mb-4 mt-1.5 grid grid-cols-3 gap-2">
              {POSITIONS.map((p) => (
                <button key={p.value} type="button" onClick={() => set("captionStyle", { ...t.captionStyle, position: p.value })} className={cn("flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs transition", t.captionStyle.position === p.value ? "border-primary/60 bg-primary/10" : "border-white/10 text-muted-foreground hover:border-white/20")}>
                  <span className={cn("flex h-12 w-8 flex-col rounded border border-white/20 bg-white/[0.04] p-1", p.value === "top" ? "justify-start" : p.value === "center" ? "justify-center" : "justify-end")}><span className="h-1 rounded-full bg-current" /></span>
                  {p.label}
                </button>
              ))}
            </div>
            <CaptionsPanel style={t.captionStyle} onChange={(s) => set("captionStyle", s)} />
          </Block>

          <Block n={5} title="Musique" icon={Music2} hint="Importe ton morceau, choisis où il commence et s'il rythme les coupes.">
            <MusicSection
              musicTrackId={t.musicTrackId}
              musicUrl={t.musicUrl}
              musicName={t.musicName}
              musicVolume={t.musicVolume}
              musicStartMs={t.musicStartMs}
              musicBpm={t.musicBpm}
              beatSync={t.beatSync}
              tracks={tracks}
              premiumAllowed={plan.premiumVoices}
              onMusicChange={(id, grid) => setT((s) => ({ ...s, musicTrackId: id, musicUrl: null, musicName: null, musicStartMs: id === s.musicTrackId && !s.musicUrl ? s.musicStartMs : 0, musicBpm: grid?.bpm ?? null, musicBeatOffsetMs: grid?.offsetMs ?? null }))}
              onCustomMusicChange={(url, name, grid) => setT((s) => ({ ...s, musicUrl: url, musicName: name, musicTrackId: url ? null : s.musicTrackId, musicStartMs: url && url === s.musicUrl ? s.musicStartMs : 0, musicBpm: grid?.bpm ?? null, musicBeatOffsetMs: grid?.offsetMs ?? null }))}
              onVolumeChange={(v) => set("musicVolume", v)}
              onMusicStartChange={(v) => set("musicStartMs", v)}
              onBeatSyncChange={(v) => set("beatSync", v)}
            />
          </Block>

          <Block n={6} title="Visuels" icon={ImageIcon} hint="Ce qui apparaît derrière le texte, scène par scène.">
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                [true, "Vidéos de banque d'images", "Une vidéo Pexels ou Pixabay par scène, choisie selon le script. Recommandé."],
                [false, "Fond animé seul", "Le fond de ta marque, sans vidéos — un rendu sobre et régulier."],
              ] as const).map(([value, title, body]) => (
                <button key={title} type="button" disabled={value && !stockConfigured} onClick={() => set("stockVisuals", value)} className={cn("rounded-lg border p-3 text-left transition disabled:opacity-50", t.stockVisuals === value ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{body}</p>
                </button>
              ))}
            </div>
            {!stockConfigured && <p className="mt-2 text-[11px] text-amber-300">La banque d'images n'est pas configurée (clé Pexels) : les vidéos utiliseront le fond animé.</p>}
          </Block>

          <Block n={7} title="Fond" icon={Palette} hint={t.stockVisuals ? "Visible avant chaque vidéo de scène et quand aucune ne correspond." : "Le décor de toute la vidéo."}>
            <BackgroundControls value={t.backgroundStyle} onChange={(b) => set("backgroundStyle", b)} />
          </Block>

          <Block n={8} title="Format et qualité" icon={Clapperboard}>
            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.map((a) => {
                const Icon = ASPECT_ICONS[a];
                return (
                  <button key={a} type="button" onClick={() => set("aspectRatio", a)} className={cn("rounded-lg border p-2.5 text-center transition", t.aspectRatio === a ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                    <Icon className="mx-auto h-4 w-4 text-brand-300" />
                    <p className="mt-1 text-sm font-semibold">{ASPECT_LABELS[a].ratio}</p>
                    <p className="text-[10px] text-muted-foreground">{ASPECT_LABELS[a].hint}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {RESOLUTIONS.map((r) => {
                const locked = RES_RANK[r] > RES_RANK[plan.maxResolution];
                return (
                  <button key={r} type="button" disabled={locked} onClick={() => set("resolution", r)} className={cn("rounded-lg border py-2 text-xs transition disabled:opacity-40", t.resolution === r ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                    {r} {locked && <Lock className="inline h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </Block>

          {!templateId && <Badge variant="secondary" className="mx-auto flex w-fit">Tout est modifiable plus tard</Badge>}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/95 p-3 backdrop-blur lg:hidden">
        {dirty && <p className="mb-1.5 text-center text-[11px] text-amber-300">Modifications non enregistrées</p>}
        {saveButton}
      </div>
    </div>
  );
}
