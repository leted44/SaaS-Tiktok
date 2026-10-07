"use client";

import { RESULTS_ENABLED } from "@/lib/results/config";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayerRef } from "@remotion/player";
import { FileText, Captions, Layers, Mic2, Film, GalleryHorizontalEnd, ArrowLeft, Check, CheckCircle2, Download, Loader2, Pencil, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { MarkPostedDialog } from "@/components/projects/mark-posted-dialog";
import { ResultsButton } from "@/components/results/results-dialog";
import { PreviewPlayer } from "@/components/studio/preview-player";
import { Timeline } from "@/components/studio/timeline";
import { ScriptPanel } from "@/components/studio/script-panel";
import { CaptionsPanel } from "@/components/studio/captions-panel";
import { VisualsPanel } from "@/components/studio/visuals-panel";
import { AudioPanel } from "@/components/studio/audio-panel";
import { ExportPanel } from "@/components/studio/export-panel";
import { FormatSwitcher } from "@/components/studio/format-switcher";
import { saveEditorState, renameProject, unmarkProjectPosted } from "@/server/actions/projects";
import { POST_PLATFORM_LABELS, type PostPlatform } from "@/lib/projects/progress";
import { getTrack } from "@/lib/music/library";
import type { EditorState, StudioProps } from "@/components/studio/types";
import type { ShortVideoProps } from "@/lib/render/props";
import { DEFAULT_PREVIEW_PROPS } from "@/lib/render/props";
import { alignLayersToScenes, applyBeatSync, timelineOffsetMs } from "@/lib/render/beat-grid";
import { cn } from "@/lib/utils";
import { coverTitleSuggestions } from "@/lib/video-cover";

export function Studio(props: StudioProps) {
  const { carouselOnly, project, scripts, activeScriptId, reviewTally, voiceover, renders, previewProps, user, planLimits, voices, customVoice, tracks, integrations } = props;
  const router = useRouter();
  const playerRef = useRef<PlayerRef>(null);
  const [tab, setTab] = useState("script");
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  const [title, setTitle] = useState(project.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [state, setState] = useState<EditorState>({
    captionStyle: project.captionStyle,
    visualLayers: project.visualLayers,
    visualPool: project.visualPool,
    backgroundStyle: project.backgroundStyle,
    musicTrackId: project.musicTrackId,
    musicUrl: project.musicUrl,
    musicName: project.musicName,
    musicVolume: project.musicVolume,
    musicStartMs: project.musicStartMs,
    musicBpm: project.musicBpm,
    musicBeatOffsetMs: project.musicBeatOffsetMs,
    beatSync: project.beatSync,
    voiceId: project.voiceId,
    visualStyle: project.visualStyle,
    visualMotif: project.visualMotif,
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSaved = useRef(JSON.stringify(state));
  const dirty = JSON.stringify(state) !== lastSaved.current;

  /** Save immediately, bypassing the debounce — for an action the server reads the row back for right after, such as generating AI visuals from the current style and motif. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    const snapshot = JSON.stringify(state);
    if (snapshot === lastSaved.current) return true;
    const res = await saveEditorState(project.id, state);
    if (!res.ok) {
      setSaveStatus("error");
      toast.error(res.error);
      return false;
    }
    lastSaved.current = snapshot;
    setSaveStatus("saved");
    return true;
  }, [state, project.id]);

  // Debounced autosave of editor state.
  useEffect(() => {
    if (!dirty) return;
    setSaveStatus("saving");
    const t = setTimeout(() => void saveNow(), 900);
    return () => clearTimeout(t);
  }, [dirty, saveNow]);

  const activeScript = scripts.find((s) => s.id === activeScriptId) ?? scripts[0] ?? null;

  // Live composition props: server-built base + client-side editor overrides.
  //
  // The server deliberately leaves the cuts unsnapped here (snapCuts: false):
  // the music can change without the page reloading, and the preview has to
  // show the new timing at once. The snap itself is the same pure function the
  // render uses, so what plays is what exports.
  const liveProps: ShortVideoProps = useMemo(() => {
    const base = previewProps ?? { ...DEFAULT_PREVIEW_PROPS, title: project.title };
    const track = getTrack(state.musicTrackId);
    const musicUrl = state.musicUrl || track?.url || null;
    const grid = musicUrl && state.beatSync && state.musicBpm ? { bpm: state.musicBpm, offsetMs: timelineOffsetMs(state.musicBeatOffsetMs ?? 0, state.musicStartMs, state.musicBpm) } : null;
    // Each scene's visual follows its scene as the current voice times it, then the cuts go on the beat.
    const synced = applyBeatSync(base.scenes, alignLayersToScenes(state.visualLayers, base.scenes), grid, base.durationMs);
    return {
      ...base,
      captionStyle: state.captionStyle,
      scenes: synced.scenes,
      visualLayers: synced.layers,
      backgroundStyle: state.backgroundStyle,
      musicUrl,
      musicVolume: state.musicVolume,
      musicStartMs: state.musicStartMs,
      beatGrid: grid,
    };
  }, [previewProps, state, project.title]);

  // Stock search term per composition scene. The hook and CTA have no b-roll
  // suggestion of their own, so they borrow the nearest scene's.
  const sceneQueries = useMemo(() => {
    const scriptScenes = activeScript?.scenes ?? [];
    const last = liveProps.scenes.length - 1;
    return liveProps.scenes.map((_, i) => {
      if (i === 0) return scriptScenes[0]?.brollQuery ?? "";
      if (i === last) return scriptScenes[scriptScenes.length - 1]?.brollQuery ?? "";
      return scriptScenes[i - 1]?.brollQuery ?? "";
    });
  }, [activeScript, liveProps.scenes]);

  // Each scene's AI image brief, mapped the same way (lib/pipeline/visuals sceneVisualDescriptions):
  // what "Copier la description" hands over for an empty scene.
  const sceneBriefs = useMemo(() => {
    const scriptScenes = activeScript?.scenes ?? [];
    const last = liveProps.scenes.length - 1;
    const briefs = liveProps.scenes.map((_, i) => (i === 0 ? scriptScenes[0] : i === last ? scriptScenes[scriptScenes.length - 1] : scriptScenes[i - 1])?.visualDescription ?? "");
    const hook = activeScript?.hookVisual?.trim();
    if (hook && briefs.length > 1) briefs[0] = hook;
    return briefs;
  }, [activeScript, liveProps.scenes]);

  // The cover's choices: the project's own stored images (stock pictures live on another host the cover renderer does not read), scenes first.
  const cover = useMemo(() => {
    const last = liveProps.scenes.length - 1;
    const name = (i: number | undefined) => (i === undefined ? "Image" : i === 0 ? "Hook" : i === last ? "CTA" : `Scène ${i}`);
    const own = (src: string | undefined): src is string => Boolean(src && /(^|\/)asset\//.test(src));
    const seen = new Set<string>();
    const images: { src: string; label: string }[] = [];
    for (const l of [...state.visualLayers].sort((a, b) => (a.sceneIndex ?? 99) - (b.sceneIndex ?? 99) || a.startMs - b.startMs)) {
      if (l.type !== "image" || !own(l.src) || seen.has(l.src)) continue;
      seen.add(l.src);
      images.push({ src: l.src, label: name(l.sceneIndex) });
    }
    for (const p of state.visualPool) {
      if (p.type !== "image" || p.rejected || !own(p.src) || seen.has(p.src)) continue;
      seen.add(p.src);
      images.push({ src: p.src, label: p.label?.trim() || "Bibliothèque" });
    }
    return { images: images.slice(0, 16), titles: activeScript ? coverTitleSuggestions(activeScript) : [] };
  }, [state.visualLayers, state.visualPool, liveProps.scenes.length, activeScript]);

  const patch = useCallback(<K extends keyof EditorState>(k: K, v: EditorState[K]) => setState((s) => ({ ...s, [k]: v })), []);

  const [templating, setTemplating] = useState(false);

  /** Turn this video's look into an autopilot template — saving pending edits first, so the template gets exactly what is on screen. */
  async function saveAsTemplate() {
    setTemplating(true);
    if (dirty) {
      const snapshot = JSON.stringify(state);
      const res = await saveEditorState(project.id, state);
      if (!res.ok) {
        setTemplating(false);
        return toast.error(res.error);
      }
      lastSaved.current = snapshot;
    }
    router.push(`/autopilot/templates/new?from=${project.id}`);
  }

  async function commitTitle() {
    setEditingTitle(false);
    if (title.trim() === project.title) return;
    const res = await renameProject(project.id, title);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  const [marking, setMarking] = useState(false);
  const [unmarking, setUnmarking] = useState(false);
  async function unmarkPosted() {
    setUnmarking(true);
    const res = await unmarkProjectPosted(project.id);
    setUnmarking(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Marque « publiée » retirée.");
    router.refresh();
  }

  // The tabs in working order, each marked once its step is done — the studio's
  // own checklist: a script, a voice that matches the chosen one, a visual on
  // every scene, a finished video.
  const readyRender = renders.find((r) => r.status === "COMPLETED" && r.outputUrl) ?? null;
  const steps = [
    { value: "script", label: "Script", icon: FileText, done: Boolean(activeScript) },
    { value: "audio", label: "Voix", icon: Mic2, done: Boolean(voiceover?.audioUrl) && voiceover?.voiceId === state.voiceId },
    { value: "visuals", label: "Visuels", icon: Layers, done: liveProps.scenes.length > 0 && liveProps.scenes.every((_, i) => state.visualLayers.some((l) => l.sceneIndex === i)) },
    { value: "captions", label: "Sous-titres", icon: Captions, done: false },
    { value: "export", label: "Export", icon: Film, done: Boolean(readyRender) },
  ];

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link href="/projects"><ArrowLeft /></Link></Button>
          <div className="min-w-0">
            {editingTitle ? (
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => e.key === "Enter" && commitTitle()} className="h-9 w-80 font-display text-lg font-bold" />
            ) : (
              <button onClick={() => setEditingTitle(true)} className="group inline-flex items-center gap-2 truncate font-display text-xl font-bold tracking-tight md:text-2xl">
                {title} <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
            <p className="text-xs text-muted-foreground">{project.aspectRatio === "VERTICAL" ? "9:16" : project.aspectRatio === "SQUARE" ? "1:1" : "16:9"} · {project.niche || "Sans niche"} · {activeScript ? `${activeScript.wordCount} mots · ~${activeScript.estimatedDurationSec}s` : "Aucun script"}</p>
          </div>
          <FormatSwitcher projectId={project.id} active="video" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex items-center gap-1.5 text-xs", saveStatus === "error" ? "text-red-300" : "text-muted-foreground")}>
            {saveStatus === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…</> : saveStatus === "saved" ? <><Check className="h-3 w-3 text-emerald-400" /> Enregistré</> : saveStatus === "error" ? "Échec de l'enregistrement" : "Toutes les modifications sont enregistrées"}
          </span>
          <StatusBadge status={project.status} />
          {project.postedAt ? (
            <Button variant="secondary" size="sm" loading={unmarking} onClick={unmarkPosted} title={project.postedPlatforms.length ? `Publiée sur ${project.postedPlatforms.map((p) => POST_PLATFORM_LABELS[p as PostPlatform] ?? p).join(", ")}` : "Publiée"} className="border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15">
              {!unmarking && <CheckCircle2 />} Publiée <Undo2 className="h-3.5 w-3.5 opacity-60" />
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setMarking(true)}><CheckCircle2 /> Marquer publiée</Button>
          )}
          {RESULTS_ENABLED && project.postedAt && <ResultsButton projectId={project.id} title={title} format="video" platforms={project.postedPlatforms} />}
          {planLimits.autopilot && (
            <Button variant="secondary" size="sm" loading={templating} onClick={saveAsTemplate} title="Enregistrer la voix, les sous-titres, la musique, le fond et le format de cette vidéo comme modèle du pilote automatique">
              {!templating && <Wand2 />} <span className="sm:hidden">Modèle</span><span className="hidden sm:inline">Enregistrer comme modèle</span>
            </Button>
          )}
          {readyRender?.outputUrl ? (
            <Button asChild variant="gradient" size="sm"><a href={readyRender.outputUrl} download target="_blank" rel="noreferrer"><Download /> Télécharger</a></Button>
          ) : (
            <Button variant="gradient" size="sm" onClick={() => setTab("export")}><Film /> Exporter</Button>
          )}
        </div>
      </div>

      {carouselOnly && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand-400/25 bg-brand-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <GalleryHorizontalEnd className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
            <div>
              <p className="text-sm font-semibold">Ce projet est un carrousel</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Le script ci-dessous est la source de ton carrousel : aucune vidéo n'est en cours. Si tu veux aussi une vidéo sur ce sujet, pars de ce script et génère la voix off — rien n'est à réécrire.</p>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0"><Link href={`/studio/${project.id}/carousel`}><GalleryHorizontalEnd /> Retour au carrousel</Link></Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <PreviewPlayer ref={playerRef} inputProps={liveProps} className={cn("w-full", project.aspectRatio === "VERTICAL" ? "max-w-[400px]" : project.aspectRatio === "SQUARE" ? "max-w-[560px]" : "max-w-[860px]")} />
          </div>
          {liveProps.scenes.length > 0 && <Timeline props={liveProps} playerRef={playerRef} selectedScene={selectedScene} onSelectScene={(i) => { setSelectedScene(i); if (tab === "export") setTab("visuals"); }} />}
          {!activeScript && (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">
              L'aperçu affiche le fond animé tant qu'aucun script n'existe. <Link href={`/scripts?project=${project.id}`} className="text-foreground underline-offset-4 hover:underline">Générer un script maintenant</Link>.
            </div>
          )}
        </div>

        {/*
          The height cap and inner scrolling are desktop-only on purpose. On a
          phone they made the editor a short, fixed-height box with its own
          scrollbar inside an already-scrolling page: the tab with the most
          content (Export) got trapped in it, and Radix's ScrollArea viewport —
          which lays its content out as a table — stopped long strings from
          wrapping, widening the page past the viewport. Below xl the panel is
          just a block that grows, and the page scrolls.
        */}
        <div className="surface flex min-w-0 flex-col xl:sticky xl:top-24 xl:max-h-[calc(100vh-140px)]">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b border-white/[0.05] p-3">
              {/* The carousel used to hide here as a sixth, outbound tab — it now has an equal spot in the FormatSwitcher above, so this bar is video's own five. */}
              <TabsList className="grid w-full grid-cols-5">
                {steps.map((st) => (
                  <TabsTrigger key={st.value} value={st.value} aria-label={st.label} className="relative flex-col gap-0.5 px-0.5 py-1 text-[10px] sm:flex-row sm:px-3 sm:text-xs">
                    <st.icon />
                    <span>{st.label}</span>
                    {st.done && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="fait" />}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="min-h-0 min-w-0 flex-1 xl:overflow-y-auto">
              <div className="min-w-0 p-4">
                <TabsContent value="script" className="mt-0">
                  <ScriptPanel projectId={project.id} scripts={scripts} activeScriptId={activeScriptId} selectedScene={selectedScene} onSelectScene={(i) => { setSelectedScene(i); if (i !== null && liveProps.scenes[i]) playerRef.current?.seekTo(Math.round((liveProps.scenes[i].startMs / 1000) * liveProps.fps)); }} aiConfigured={integrations.ai} scriptCost={planLimits.costs.script} reviewTally={reviewTally} />
                </TabsContent>
                <TabsContent value="captions" className="mt-0">
                  <CaptionsPanel style={state.captionStyle} onChange={(s) => patch("captionStyle", s)} />
                </TabsContent>
                <TabsContent value="visuals" className="mt-0">
                  <VisualsPanel
                    projectId={project.id}
                    layers={state.visualLayers}
                    background={state.backgroundStyle}
                    scenes={liveProps.scenes}
                    sceneQueries={sceneQueries}
                    gemini={{
                      briefs: sceneBriefs,
                      aspect: project.aspectRatio === "VERTICAL" ? "9:16" : project.aspectRatio === "SQUARE" ? "1:1" : "16:9",
                      cast: Boolean(project.characterReference.own || project.characterReference.space),
                    }}
                    stockConfigured={integrations.stock}
                    selectedScene={selectedScene}
                    onSelectScene={(i) => { setSelectedScene(i); if (liveProps.scenes[i]) playerRef.current?.seekTo(Math.round((liveProps.scenes[i].startMs / 1000) * liveProps.fps)); }}
                    pool={state.visualPool}
                    onPoolChange={(p) => patch("visualPool", p)}
                    onLayersChange={(l) => patch("visualLayers", l)}
                    onBackgroundChange={(b) => patch("backgroundStyle", b)}
                    visualStyle={state.visualStyle}
                    defaultVisualStyle={project.defaultVisualStyle}
                    visualMotif={state.visualMotif}
                    characterReference={project.characterReference}
                    onVisualStyleChange={(v) => patch("visualStyle", v)}
                    onMotifChange={(v) => patch("visualMotif", v)}
                    onCaptionStyleChange={(s) => patch("captionStyle", s)}
                    aiImagesConfigured={integrations.aiImages}
                    aiImageCost={planLimits.costs.aiImage}
                    admin={user.admin}
                    credits={user.credits}
                    hasScript={Boolean(activeScript)}
                    ensureSaved={saveNow}
                    videoClipsConfigured={integrations.videoClips}
                    videoClipCosts={{ standard: planLimits.costs.videoClipStandard, standardLong: planLimits.costs.videoClipStandardLong, pro: planLimits.costs.videoClipPro, proLong: planLimits.costs.videoClipProLong }}
                  />
                </TabsContent>
                <TabsContent value="audio" className="mt-0">
                  <AudioPanel
                    projectId={project.id}
                    scriptId={activeScript?.id ?? null}
                    voiceover={voiceover}
                    voiceId={state.voiceId}
                    musicTrackId={state.musicTrackId}
                    musicUrl={state.musicUrl}
                    musicName={state.musicName}
                    musicVolume={state.musicVolume}
                    musicStartMs={state.musicStartMs}
                    voices={voices}
                    customVoice={customVoice}
                    voiceCloningAllowed={planLimits.voiceCloning}
                    voiceCloneCost={planLimits.costs.voiceClone}
                    tracks={tracks}
                    previewText={activeScript?.hook ?? ""}
                    premiumAllowed={planLimits.premiumVoices}
                    admin={user.admin}
                    ttsConfigured={integrations.tts}
                    estimatedDurationSec={activeScript?.estimatedDurationSec ?? project.targetDurationSec}
                    costPer30s={planLimits.costs.voicePer30s}
                    credits={user.credits}
                    onVoiceChange={(id) => patch("voiceId", id)}
                    onCustomVoiceChange={() => router.refresh()}
                    onMusicChange={(id, grid) => setState((s) => ({ ...s, musicTrackId: id, musicUrl: null, musicName: null, musicStartMs: id === s.musicTrackId && !s.musicUrl ? s.musicStartMs : 0, musicBpm: grid?.bpm ?? null, musicBeatOffsetMs: grid?.offsetMs ?? null }))}
                    onCustomMusicChange={(url, name, grid) => setState((s) => ({ ...s, musicUrl: url, musicName: name, musicTrackId: url ? null : s.musicTrackId, musicStartMs: url && url === s.musicUrl ? s.musicStartMs : 0, musicBpm: grid?.bpm ?? null, musicBeatOffsetMs: grid?.offsetMs ?? null }))}
                    beatSync={state.beatSync}
                    musicBpm={state.musicBpm}
                    onBeatSyncChange={(v) => patch("beatSync", v)}
                    onVolumeChange={(v) => patch("musicVolume", v)}
                    onMusicStartChange={(v) => patch("musicStartMs", v)}
                  />
                </TabsContent>
                <TabsContent value="export" className="mt-0">
                  <ExportPanel projectId={project.id} renders={renders} planLimits={planLimits} credits={user.credits} hasScript={Boolean(activeScript)} hasVoiceover={Boolean(voiceover?.audioUrl)} dirty={dirty} scriptId={activeScript?.id ?? null} socialCopy={activeScript?.socialCopy ?? null} hashtags={activeScript?.hashtags ?? []} aiConfigured={integrations.ai} cover={cover} />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      {marking && <MarkPostedDialog projectId={project.id} title={project.title} open={marking} onOpenChange={setMarking} />}
    </div>
  );
}
