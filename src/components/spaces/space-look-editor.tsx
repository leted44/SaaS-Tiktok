"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Captions, Clapperboard, GalleryHorizontalEnd, ImageIcon, Layers, Loader2, Mic2, Music2, Palette, Pause, Play, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PreviewPlayer } from "@/components/studio/preview-player";
import { CaptionsPanel } from "@/components/studio/captions-panel";
import { MusicSection, type MusicTrackOption } from "@/components/studio/music-section";
import { BackgroundControls } from "@/components/studio/background-controls";
import { VoiceTonePicker } from "@/components/studio/voice-tone";
import { VoiceList, type VoiceOption } from "@/components/shared/voice-list";
import { StylePicker } from "@/components/shared/style-picker";
import { CoverLookControls, CoverPreview, useCoverSettings } from "@/components/studio/cover-panel";
import { CarouselDesignControls } from "@/components/carousel/design-controls";
import { useVoicePreview } from "@/lib/tts/use-voice-preview";
import { sampleText, templatePreviewProps } from "@/lib/autopilot/template-shared";
import { DEFAULT_VISUAL_STYLE } from "@/lib/carousel/art-direction";
import { saveSpaceLookAction } from "@/server/actions/space-kit";
import type { CarouselLook, VideoLook } from "@/lib/space-kit";
import type { CaptionStyle } from "@/lib/validations";
import { cn } from "@/lib/utils";

type VideoDraft = Omit<VideoLook, "savedAt" | "fromProjectId" | "cover">;
type CarouselDraft = Omit<CarouselLook, "savedAt" | "fromProjectId">;

const POSITIONS: { value: CaptionStyle["position"]; label: string }[] = [
  { value: "top", label: "Haut" },
  { value: "center", label: "Centre" },
  { value: "bottom", label: "Bas" },
];

function Block({ title, icon: Icon, hint, children }: { title: string; icon: typeof Mic2; hint?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-brand-300" /> {title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Espaces → « Régler le rendu »: every setting a new post of the space starts
 * with (lib/space-kit), in one page, with the preview of what it gives. Nothing
 * here costs anything — the voice samples are the free previews.
 */
export function SpaceLookEditor({ space, initial, saved, sampleImage, voices, tracks, premiumAllowed, brand }: {
  space: { id: string; name: string; language: string };
  initial: { voiceId: string | null; video: VideoLook; carousel: CarouselLook };
  saved: { video: boolean; carousel: boolean };
  sampleImage: string | null;
  voices: VoiceOption[];
  tracks: MusicTrackOption[];
  premiumAllowed: boolean;
  brand: { primaryColor: string; accentColor: string; fontFamily: string };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"video" | "carousel">("video");
  const [voiceId, setVoiceId] = useState(initial.voiceId);
  const [video, setVideo] = useState<VideoDraft>(() => {
    const { savedAt: _s, fromProjectId: _f, cover: _c, ...rest } = initial.video;
    return rest;
  });
  const [carousel, setCarousel] = useState<CarouselDraft>(() => {
    const { savedAt: _s, fromProjectId: _f, ...rest } = initial.carousel;
    return rest;
  });
  const setV = <K extends keyof VideoDraft>(k: K, v: VideoDraft[K]) => setVideo((s) => ({ ...s, [k]: v }));

  const coverImages = useMemo(() => (sampleImage ? [{ src: sampleImage, label: "Exemple" }] : []), [sampleImage]);
  const coverTitles = useMemo(() => [{ title: "Ton titre accrocheur ici", emphasis: "accrocheur" }], []);
  const cover = useCoverSettings({ projectId: "", images: coverImages, titles: coverTitles, accountAccent: brand.accentColor, initial: initial.video.cover });

  const draft = JSON.stringify({ voiceId, video, carousel, cover: cover.look });
  const savedDraft = useRef(draft);
  const dirty = draft !== savedDraft.current;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const preview = useVoicePreview(sampleText(space.language).slice(0, 280));
  const previewProps = useMemo(
    () =>
      templatePreviewProps(
        {
          name: space.name, isDefault: false, language: space.language, tone: "energetic", targetDurationSec: 20,
          voiceId: voiceId ?? "", voiceStability: video.voiceStability ?? 0.5, voiceSpeed: 1, aspectRatio: "VERTICAL", resolution: "1080p",
          captionStyle: video.captionStyle, backgroundStyle: video.backgroundStyle, stockVisuals: Boolean(sampleImage),
          musicTrackId: video.musicTrackId, musicUrl: video.musicUrl, musicName: video.musicName, musicVolume: video.musicVolume, musicStartMs: video.musicStartMs,
          musicBpm: video.musicBpm, musicBeatOffsetMs: video.musicBeatOffsetMs, beatSync: video.beatSync,
        },
        brand,
        sampleImage ? { url: sampleImage, type: "image" } : null,
      ),
    [space.name, space.language, voiceId, video, brand, sampleImage],
  );
  // Open on a moment with words on screen, so the captions show before pressing play.
  const [captionFrame] = useState(() => (((previewProps.words[3]?.startMs ?? 1200) + 150) / 1000) * previewProps.fps);

  async function save() {
    setSaving(true);
    const res = await saveSpaceLookAction(space.id, { voiceId, video: { ...video, cover: cover.look }, carousel });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    savedDraft.current = draft;
    toast.success("Rendu enregistré : chaque nouvelle vidéo et chaque nouveau carrousel de l'espace démarreront avec.");
    router.refresh();
  }

  const saveButton = (
    <Button variant="gradient" className="w-full" loading={saving} onClick={save}>
      {!saving && <Save />} Enregistrer le rendu
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl pb-28 lg:pb-8">
      <div className="mb-5">
        <Link href="/spaces" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Espaces</Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">Rendu de « {space.name} »</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Chaque nouvelle vidéo et chaque nouveau carrousel de cet espace démarrent avec ces réglages. Le sujet, le texte et les images restent propres à chaque post. Une vidéo déjà faite garde les siens : ouvre-la et touche « Rendu de l&apos;espace » → « Appliquer ».
        </p>
        {(!saved.video || !saved.carousel) && <p className="mt-2 text-[11px] text-amber-300">Pas encore enregistré{saved.video || saved.carousel ? ` pour les ${saved.video ? "carrousels" : "vidéos"}` : ""} : les réglages affichés sont ceux par défaut.</p>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:max-w-md">
        {([["video", "Vidéos", Clapperboard], ["carousel", "Carrousels", GalleryHorizontalEnd]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={cn("flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition", tab === value ? "border-primary/60 bg-primary/10" : "border-white/10 text-muted-foreground hover:border-white/20")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "video" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Preview first on a phone: seeing the result is the point of the page. */}
          <aside className="space-y-3 lg:order-2 lg:sticky lg:top-24 lg:self-start">
            <div className="surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperçu</p>
                {voiceId && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={preview.loadingId === voiceId} onClick={() => preview.toggle(voiceId)}>
                    {preview.loadingId === voiceId ? <Loader2 className="animate-spin" /> : preview.playing === voiceId ? <Pause /> : <Play />} Écouter la voix
                  </Button>
                )}
              </div>
              <div className="flex justify-center">
                <PreviewPlayer inputProps={previewProps} initialFrame={captionFrame} className="w-full max-w-[230px]" />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Texte d&apos;exemple{sampleImage ? " sur une image de l'espace" : ""}. Dans chaque vidéo, le script, la voix et les images viennent du sujet.</p>
            </div>
            <div className="hidden lg:block">{saveButton}</div>
          </aside>

          <div className="min-w-0 space-y-4 lg:order-1">
            <Block title="Voix" icon={Mic2} hint="Qui lit le script, et sur quel ton. Écoute avant de choisir.">
              <VoiceList voices={voices} value={voiceId} onChange={setVoiceId} premiumAllowed={premiumAllowed} preview={preview} />
              <div className="mt-4 space-y-1.5">
                <Label>Ton de la voix</Label>
                <VoiceTonePicker value={video.voiceStability ?? 0.5} onChange={(v) => setV("voiceStability", v)} />
              </div>
            </Block>

            <Block title="Sous-titres" icon={Captions} hint="Le style et la place du texte à l'écran.">
              <Label>Position du texte</Label>
              <div className="mb-4 mt-1.5 grid grid-cols-3 gap-2">
                {POSITIONS.map((p) => (
                  <button key={p.value} type="button" onClick={() => setV("captionStyle", { ...video.captionStyle, position: p.value })} className={cn("rounded-lg border p-2 text-xs transition", video.captionStyle.position === p.value ? "border-primary/60 bg-primary/10" : "border-white/10 text-muted-foreground hover:border-white/20")}>
                    {p.label}
                  </button>
                ))}
              </div>
              <CaptionsPanel style={video.captionStyle} onChange={(s) => setV("captionStyle", s)} />
            </Block>

            <Block title="Musique" icon={Music2} hint="Importe ton morceau ou choisis-en un, son volume et où il commence.">
              <MusicSection
                musicTrackId={video.musicTrackId}
                musicUrl={video.musicUrl}
                musicName={video.musicName}
                musicVolume={video.musicVolume}
                musicStartMs={video.musicStartMs}
                musicBpm={video.musicBpm}
                beatSync={video.beatSync}
                tracks={tracks}
                premiumAllowed={premiumAllowed}
                onMusicChange={(id, grid) => setVideo((s) => ({ ...s, musicTrackId: id, musicUrl: null, musicName: null, musicStartMs: id === s.musicTrackId && !s.musicUrl ? s.musicStartMs : 0, musicBpm: grid?.bpm ?? null, musicBeatOffsetMs: grid?.offsetMs ?? null }))}
                onCustomMusicChange={(url, name, grid) => setVideo((s) => ({ ...s, musicUrl: url, musicName: name, musicTrackId: url ? null : s.musicTrackId, musicStartMs: url && url === s.musicUrl ? s.musicStartMs : 0, musicBpm: grid?.bpm ?? null, musicBeatOffsetMs: grid?.offsetMs ?? null }))}
                onVolumeChange={(v) => setV("musicVolume", v)}
                onMusicStartChange={(v) => setV("musicStartMs", Math.round(v))}
                onBeatSyncChange={(v) => setV("beatSync", v)}
              />
            </Block>

            <Block title="Style des images" icon={Sparkles} hint="Le style des images créées par l'IA pour chaque scène.">
              <StylePicker value={video.visualStyle ?? DEFAULT_VISUAL_STYLE} onChange={(v) => setV("visualStyle", v)} />
            </Block>

            <Block title="Fond" icon={Layers} hint="Visible quand une scène n'a pas d'image.">
              <BackgroundControls value={video.backgroundStyle} onChange={(b) => setV("backgroundStyle", b)} />
            </Block>

            <Block title="Couverture" icon={ImageIcon} hint="Le style du titre sur la photo de couverture. Le titre et l'image changent à chaque vidéo.">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex flex-col items-center gap-2">
                  <CoverPreview cover={cover} />
                  <Input value={cover.title} maxLength={60} onChange={(e) => cover.setTitle(e.target.value)} className="w-[min(56vw,220px)] text-xs sm:w-[200px]" aria-label="Titre d'exemple" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <CoverLookControls cover={cover} />
                </div>
              </div>
            </Block>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <aside className="hidden lg:order-2 lg:block lg:sticky lg:top-24 lg:self-start">{saveButton}</aside>
          <div className="min-w-0 space-y-4 lg:order-1">
            <Block title="Design" icon={Palette} hint="Le modèle, la couleur d'accent, le format et la signature de chaque nouveau carrousel.">
              <div className="space-y-4">
                <CarouselDesignControls value={carousel} onChange={(patch) => setCarousel((s) => ({ ...s, ...patch }))} brand={{ primary: brand.primaryColor, accent: brand.accentColor }} />
              </div>
            </Block>
            <Block title="Style des images" icon={Sparkles} hint="Le style des images créées par l'IA pour les slides.">
              <StylePicker value={carousel.visualStyle ?? DEFAULT_VISUAL_STYLE} onChange={(v) => setCarousel((s) => ({ ...s, visualStyle: v }))} />
            </Block>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/95 p-3 backdrop-blur lg:hidden">
        {dirty && <p className="mb-1.5 text-center text-[11px] text-amber-300">Modifications non enregistrées</p>}
        {saveButton}
      </div>
    </div>
  );
}
