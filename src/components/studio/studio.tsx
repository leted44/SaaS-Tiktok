"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayerRef } from "@remotion/player";
import { FileText, Captions, Layers, Music2, Film, ArrowLeft, Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { PreviewPlayer } from "@/components/studio/preview-player";
import { Timeline } from "@/components/studio/timeline";
import { ScriptPanel } from "@/components/studio/script-panel";
import { CaptionsPanel } from "@/components/studio/captions-panel";
import { VisualsPanel } from "@/components/studio/visuals-panel";
import { AudioPanel } from "@/components/studio/audio-panel";
import { ExportPanel } from "@/components/studio/export-panel";
import { saveEditorState, renameProject } from "@/server/actions/projects";
import { getTrack } from "@/lib/music/library";
import type { EditorState, StudioProps } from "@/components/studio/types";
import type { ShortVideoProps } from "@/lib/render/props";
import { DEFAULT_PREVIEW_PROPS } from "@/lib/render/props";
import { cn } from "@/lib/utils";

export function Studio(props: StudioProps) {
  const { project, scripts, activeScriptId, voiceover, renders, previewProps, user, planLimits, voices, customVoice, tracks, integrations } = props;
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
    voiceId: project.voiceId,
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSaved = useRef(JSON.stringify(state));
  const dirty = JSON.stringify(state) !== lastSaved.current;

  // Debounced autosave of editor state.
  useEffect(() => {
    if (!dirty) return;
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      const snapshot = JSON.stringify(state);
      const res = await saveEditorState(project.id, state);
      if (res.ok) {
        lastSaved.current = snapshot;
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        toast.error(res.error);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [state, dirty, project.id]);

  const activeScript = scripts.find((s) => s.id === activeScriptId) ?? scripts[0] ?? null;

  // Live composition props: server-built base + client-side editor overrides.
  const liveProps: ShortVideoProps = useMemo(() => {
    const base = previewProps ?? { ...DEFAULT_PREVIEW_PROPS, title: project.title };
    const track = getTrack(state.musicTrackId);
    return { ...base, captionStyle: state.captionStyle, visualLayers: state.visualLayers, backgroundStyle: state.backgroundStyle, musicUrl: state.musicUrl || track?.url || null, musicVolume: state.musicVolume };
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

  const patch = useCallback(<K extends keyof EditorState>(k: K, v: EditorState[K]) => setState((s) => ({ ...s, [k]: v })), []);

  async function commitTitle() {
    setEditingTitle(false);
    if (title.trim() === project.title) return;
    const res = await renameProject(project.id, title);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

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
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("inline-flex items-center gap-1.5 text-xs", saveStatus === "error" ? "text-red-300" : "text-muted-foreground")}>
            {saveStatus === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…</> : saveStatus === "saved" ? <><Check className="h-3 w-3 text-emerald-400" /> Enregistré</> : saveStatus === "error" ? "Échec de l'enregistrement" : "Toutes les modifications sont enregistrées"}
          </span>
          <StatusBadge status={project.status} />
          <Button variant="gradient" size="sm" onClick={() => setTab("export")}><Film /> Rendu</Button>
        </div>
      </div>

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
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="script" aria-label="Script" className="flex-col gap-0.5 px-1 py-1 text-[11px] sm:flex-row sm:text-xs"><FileText /><span>Script</span></TabsTrigger>
                <TabsTrigger value="captions" aria-label="Sous-titres" className="flex-col gap-0.5 px-1 py-1 text-[11px] sm:flex-row sm:text-xs"><Captions /><span>Sous-titres</span></TabsTrigger>
                <TabsTrigger value="visuals" aria-label="Visuels" className="flex-col gap-0.5 px-1 py-1 text-[11px] sm:flex-row sm:text-xs"><Layers /><span>Visuels</span></TabsTrigger>
                <TabsTrigger value="audio" aria-label="Audio" className="flex-col gap-0.5 px-1 py-1 text-[11px] sm:flex-row sm:text-xs"><Music2 /><span>Audio</span></TabsTrigger>
                <TabsTrigger value="export" aria-label="Export" className="flex-col gap-0.5 px-1 py-1 text-[11px] sm:flex-row sm:text-xs"><Film /><span>Export</span></TabsTrigger>
              </TabsList>
            </div>
            <div className="min-h-0 min-w-0 flex-1 xl:overflow-y-auto">
              <div className="min-w-0 p-4">
                <TabsContent value="script" className="mt-0">
                  <ScriptPanel projectId={project.id} scripts={scripts} activeScriptId={activeScriptId} selectedScene={selectedScene} onSelectScene={(i) => { setSelectedScene(i); if (i !== null && liveProps.scenes[i]) playerRef.current?.seekTo(Math.round((liveProps.scenes[i].startMs / 1000) * liveProps.fps)); }} aiConfigured={integrations.ai} scriptCost={planLimits.costs.script} />
                </TabsContent>
                <TabsContent value="captions" className="mt-0">
                  <CaptionsPanel style={state.captionStyle} onChange={(s) => patch("captionStyle", s)} />
                </TabsContent>
                <TabsContent value="visuals" className="mt-0">
                  <VisualsPanel layers={state.visualLayers} background={state.backgroundStyle} scenes={liveProps.scenes} sceneQueries={sceneQueries} stockConfigured={integrations.stock} selectedScene={selectedScene} pool={state.visualPool} onPoolChange={(p) => patch("visualPool", p)} onLayersChange={(l) => patch("visualLayers", l)} onBackgroundChange={(b) => patch("backgroundStyle", b)} />
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
                    voices={voices}
                    customVoice={customVoice}
                    voiceCloningAllowed={planLimits.voiceCloning}
                    voiceCloneCost={planLimits.costs.voiceClone}
                    tracks={tracks}
                    previewText={activeScript?.hook ?? ""}
                    premiumAllowed={planLimits.premiumVoices}
                    ttsConfigured={integrations.tts}
                    estimatedDurationSec={activeScript?.estimatedDurationSec ?? project.targetDurationSec}
                    costPer30s={planLimits.costs.voicePer30s}
                    credits={user.credits}
                    onVoiceChange={(id) => patch("voiceId", id)}
                    onCustomVoiceChange={() => router.refresh()}
                    onMusicChange={(id) => setState((s) => ({ ...s, musicTrackId: id, musicUrl: null, musicName: null }))}
                    onCustomMusicChange={(url, name) => setState((s) => ({ ...s, musicUrl: url, musicName: name, musicTrackId: url ? null : s.musicTrackId }))}
                    onVolumeChange={(v) => patch("musicVolume", v)}
                  />
                </TabsContent>
                <TabsContent value="export" className="mt-0">
                  <ExportPanel projectId={project.id} renders={renders} planLimits={planLimits} credits={user.credits} hasScript={Boolean(activeScript)} hasVoiceover={Boolean(voiceover?.audioUrl)} dirty={dirty} scriptId={activeScript?.id ?? null} socialCopy={activeScript?.socialCopy ?? null} hashtags={activeScript?.hashtags ?? []} aiConfigured={integrations.ai} />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
