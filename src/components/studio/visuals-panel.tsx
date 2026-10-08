"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Image as ImageIcon, Film, Trash2, Layers, Palette, Loader2, Sparkles, Search, Ban, LibraryBig, X, ChevronDown, Wand2, RefreshCw, Coins, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VisualLayer, VisualPoolItem, BackgroundStyle, CaptionStyle } from "@/lib/validations";
import type { ShortVideoProps } from "@/lib/render/props";
import { Progress } from "@/components/ui/progress";
import { uploadAsset } from "@/lib/assets/upload-client";
import { CharacterReference, type CharacterReferenceState } from "@/components/shared/character-reference";
import { probeVideo, convertVideo, canConvert } from "@/lib/assets/video-compat";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { BackgroundControls, backgroundLabel } from "@/components/studio/background-controls";
import { StylePicker } from "@/components/shared/style-picker";
import { composeImagePrompt, isAiSource, type VisualStyle } from "@/lib/carousel/art-direction";
import { geminiPrompt } from "@/lib/ai/gemini-prompt";
import { ctaCopyOf, ctaSceneIndex } from "@/lib/pipeline/cta-image";
import { CopyForGemini } from "@/components/shared/copy-for-gemini";
import { generateProjectVisualsAiAction } from "@/server/actions/video-visuals";
import { restoreVideoBriefsAction, rewriteVideoBriefsAction, type VideoBriefs } from "@/server/actions/brief-rewrite";
import { animateSceneClipAction, cancelVideoClipJobAction } from "@/server/actions/video-clips";
import type { VideoClipTier } from "@/lib/ai/video-clip-generator";
import { ImageModelPicker, useAdminImageModel } from "@/components/shared/image-model-picker";
import { klingDurationFor } from "@/lib/plans";

interface Asset { id: string; type: string; url: string; name: string; mimeType: string }
interface StockResult { id: string; type: "image" | "video"; url: string; thumbnailUrl: string; author: string; durationSec: number | null }

interface Props {
  projectId: string;
  layers: VisualLayer[];
  /** Visuals this project has chosen, whether or not they sit on a scene. */
  pool: VisualPoolItem[];
  background: BackgroundStyle;
  scenes: ShortVideoProps["scenes"];
  /** Stock search terms suggested by the AI, one per composition scene. */
  sceneQueries: string[];
  /** Each scene's image brief, the frame shape and whether a character sheet applies — for "Copier la description". */
  gemini: { briefs: string[]; aspect: string; cast: boolean };
  stockConfigured: boolean;
  selectedScene: number | null;
  /** Picks a scene from the image grid — the scene stock, imports and the library place onto. */
  onSelectScene?: (i: number) => void;
  onLayersChange: (l: VisualLayer[]) => void;
  onPoolChange: (p: VisualPoolItem[]) => void;
  onBackgroundChange: (b: BackgroundStyle) => void;
  visualStyle: string | null;
  /** What an unset visualStyle stands for: the space's style, else the app default. */
  defaultVisualStyle: string;
  visualMotif: string;
  onVisualStyleChange: (style: string) => void;
  onMotifChange: (motif: string) => void;
  characterReference: CharacterReferenceState;
  /** Set only the first time a project picks a style — its captions adopt a matching look, once. */
  onCaptionStyleChange: (style: CaptionStyle) => void;
  aiImagesConfigured: boolean;
  aiImageCost: number;
  /** The admin sees the image model test; clients get Nano Banana 2. */
  admin: boolean;
  credits: number;
  hasScript: boolean;
  /** Saves editor state immediately, bypassing the autosave debounce — the server reads the row back right after. */
  ensureSaved: () => Promise<boolean>;
  videoClipsConfigured: boolean;
  videoClipCosts: { standard: number; standardLong: number; pro: number; proLong: number };
}

export function VisualsPanel({
  projectId,
  layers,
  pool,
  background,
  scenes,
  sceneQueries,
  gemini,
  stockConfigured,
  selectedScene,
  onSelectScene,
  onLayersChange,
  onPoolChange,
  onBackgroundChange,
  visualStyle,
  defaultVisualStyle,
  visualMotif,
  characterReference,
  onVisualStyleChange,
  onMotifChange,
  onCaptionStyleChange,
  aiImagesConfigured,
  aiImageCost,
  admin,
  credits,
  hasScript,
  ensureSaved,
  videoClipsConfigured,
  videoClipCosts,
}: Props) {
  const router = useRouter();
  const [generatingAi, setGeneratingAi] = useState(false);
  /** The scene being drawn on its own (a tile's own "Créer" / "Refaire"), so only its tile shows the wait. */
  const [sceneBusy, setSceneBusy] = useState<number | null>(null);
  const [imageModel, setImageModel] = useAdminImageModel(admin);
  const [rewriting, setRewriting] = useState(false);
  const [previousBriefs, setPreviousBriefs] = useState<VideoBriefs | null>(null);

  async function rewriteBriefs() {
    setRewriting(true);
    const res = await rewriteVideoBriefsAction(projectId);
    setRewriting(false);
    if (!res.ok) return toast.error(res.error);
    setPreviousBriefs(res.data.previous);
    toast.success(`${res.data.changed} descriptions réécrites. « Refaire » les images voulues pour les redessiner.`);
    router.refresh();
  }

  async function restoreBriefs() {
    if (!previousBriefs) return;
    const res = await restoreVideoBriefsAction(projectId, previousBriefs);
    if (!res.ok) return toast.error(res.error);
    setPreviousBriefs(null);
    toast.success("Anciennes descriptions remises.");
    router.refresh();
  }
  const [assets, setAssets] = useState<Asset[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ name: string; done: number; total: number; fraction: number; phase: "converting" | "uploading" } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const library = pool.filter((p) => !p.rejected);
  /** One active fal.ai animation job per layer, keyed by layer id. */
  const [clipJobs, setClipJobs] = useState<Record<string, { jobId: string; status: string } | undefined>>({});
  // The poll effect below fires minutes after it was set up, by which point a
  // completion patch built from the `layers` prop captured at that time would
  // discard any edit made in between — this ref always holds the latest one.
  const layersRef = useRef(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  useEffect(() => {
    fetch("/api/assets/upload").then((r) => r.json()).then((j) => setAssets((j.assets ?? []).filter((a: Asset) => a.type === "IMAGE" || a.type === "VIDEO"))).catch(() => undefined);
  }, []);

  // Polls every active animation job every few seconds — the same pattern the
  // export panel uses for a render, and for the same reason: a real
  // generation takes minutes, so nothing here blocks waiting for it, and each
  // poll is what actually advances the job one step (see /api/video-clips/[id]).
  useEffect(() => {
    const active = Object.entries(clipJobs).filter(([, j]) => j && (j.status === "QUEUED" || j.status === "PROCESSING"));
    if (!active.length) return;
    let stopped = false;
    const poll = async () => {
      for (const [layerId, j] of active) {
        if (!j || stopped) return;
        const res = await fetch(`/api/video-clips/${j.jobId}`, { cache: "no-store" });
        if (!res.ok || stopped) continue;
        const data = (await res.json()) as { status: string; resultUrl: string | null; error: string | null };
        if (data.status === "COMPLETED" && data.resultUrl) {
          onLayersChange(layersRef.current.map((l) => (l.id === layerId ? { ...l, type: "video", src: data.resultUrl!, kenBurns: "none" } : l)));
          setClipJobs((prev) => { const next = { ...prev }; delete next[layerId]; return next; });
          toast.success("Scène animée ! Les crédits ont été débités.");
          router.refresh();
        } else if (data.status === "FAILED") {
          setClipJobs((prev) => { const next = { ...prev }; delete next[layerId]; return next; });
          toast.error(data.error ? `Animation impossible : ${data.error}` : "L'animation a échoué. Les crédits ont été remboursés.");
          router.refresh();
        } else if (data.status !== j.status) {
          setClipJobs((prev) => ({ ...prev, [layerId]: { jobId: j.jobId, status: data.status } }));
        }
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { stopped = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipJobs]);

  async function animateScene(layerId: string, tier: VideoClipTier) {
    // Shown as animating at once: the server first looks at the image to write its motion, a few seconds a second tap must not double.
    setClipJobs((prev) => ({ ...prev, [layerId]: { jobId: "", status: "PREPARING" } }));
    const dropPending = () => setClipJobs((prev) => { const next = { ...prev }; delete next[layerId]; return next; });
    if (!(await ensureSaved())) return dropPending();
    const res = await animateSceneClipAction(projectId, layerId, tier);
    if (!res.ok) { dropPending(); return toast.error(res.error); }
    setClipJobs((prev) => ({ ...prev, [layerId]: { jobId: res.data.jobId, status: "QUEUED" } }));
    toast.info("Animation lancée — ça peut prendre plusieurs minutes.");
  }

  async function cancelAnimate(layerId: string) {
    const job = clipJobs[layerId];
    if (!job?.jobId) return;
    setClipJobs((prev) => { const next = { ...prev }; delete next[layerId]; return next; });
    const res = await cancelVideoClipJobAction(job.jobId);
    if (res.ok) { toast.info("Animation annulée, crédits remboursés."); router.refresh(); }
  }

  /**
   * Convert a recording the render pipeline cannot read, using the phone's own
   * decoder. Returns the original untouched when it is already fine, and also
   * when conversion is impossible — an upload that might fail at render time
   * is still better than refusing the file outright.
   */
  async function makeRenderable(file: File, report: (fraction: number) => void): Promise<File> {
    if (!file.type.startsWith("video/")) return file;
    const probe = await probeVideo(file).catch(() => null);
    if (!probe || probe.renderable) return file;

    if (!canConvert()) {
      toast.warning(`${file.name} est en ${probe.label}, que le moteur de rendu ne sait pas lire, et ce navigateur ne peut pas le convertir. Le rendu échouera probablement sur ce clip.`);
      return file;
    }

    toast.info(`${file.name} est en ${probe.label} — conversion en cours, cela prend à peu près la durée du clip.`);
    try {
      return await convertVideo(file, report);
    } catch (err) {
      toast.warning(`Conversion impossible (${err instanceof Error ? err.message : "erreur"}). Le fichier est envoyé tel quel.`);
      return file;
    }
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    const sent: Asset[] = [];
    // Serial on purpose: a phone's upstream is the bottleneck, so uploading in
    // parallel only splits the same bandwidth and makes every file slower.
    for (const [i, original] of list.entries()) {
      const track = (phase: "converting" | "uploading") => (fraction: number) =>
        setUploading({ name: original.name, done: i, total: list.length, fraction, phase });
      track("converting")(0);
      try {
        const file = await makeRenderable(original, track("converting"));
        track("uploading")(0);
        const asset = await uploadAsset(file, { onProgress: track("uploading") });
        setAssets((a) => [asset, ...a]);
        sent.push(asset);
      } catch (err) {
        toast.error(`${original.name} : ${err instanceof Error ? err.message : "échec de l'envoi"}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    if (sent.length) placeInOrder(sent);
  }

  /**
   * Delete an uploaded file for good — the storage object and its record, not
   * just this project's use of it. Removed from this project's own scenes and
   * library right away; a *different* project that already placed the same
   * clip on a scene keeps that reference and will show a broken visual there,
   * since cleaning that up would mean scanning every project the user has.
   */
  async function deleteAsset(asset: Asset) {
    if (!window.confirm(`Supprimer définitivement "${asset.name}" ? Il disparaîtra de votre bibliothèque. S'il est utilisé dans un autre projet, il n'y sera plus visible.`)) return;
    setDeleting(asset.id);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error ?? "Échec de la suppression"); }
      setAssets((a) => a.filter((x) => x.id !== asset.id));
      onLayersChange(layers.filter((l) => l.src !== asset.url));
      onPoolChange(pool.filter((p) => p.src !== asset.url));
      toast.success(`"${asset.name}" supprimé`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la suppression");
    } finally {
      setDeleting(null);
    }
  }

  const sceneLabel = (i: number) => (i === 0 ? "au hook" : i === scenes.length - 1 ? "au CTA" : `à la scène ${i}`);
  /** Bare name, for anything that is not a sentence fragment (dropdowns, chips). */
  const sceneName = (i: number) => (i === 0 ? "Hook" : i === scenes.length - 1 ? "CTA" : `Scène ${i}`);

  /**
   * Remember visuals for this project, keyed by src.
   *
   * Takes a list rather than one item on purpose: every caller builds its new
   * pool from the `pool` of the current render, so two separate calls in one
   * handler would each start from the same array and the second would discard
   * the first. One call, one commit.
   */
  function remember(...items: (Omit<VisualPoolItem, "id"> & { id?: string })[]) {
    const seen = new Set(pool.map((p) => p.src));
    // Placing a clip by hand overrides an earlier "not this one".
    const reinstated = new Set(items.map((i) => i.src).filter((src) => pool.some((p) => p.src === src && p.rejected)));
    const fresh: VisualPoolItem[] = [];
    for (const item of items) {
      if (!item.src || seen.has(item.src)) continue;
      seen.add(item.src);
      fresh.push({ ...item, id: item.id ?? nanoid(8) });
    }
    if (!fresh.length && !reinstated.size) return;
    onPoolChange([...fresh, ...pool.map((p) => (reinstated.has(p.src) ? { ...p, rejected: false } : p))]);
  }

  /** What currently sits on a scene, as a pool entry — so replacing it never loses it. */
  function occupantOf(sceneIdx: number): (Omit<VisualPoolItem, "id"> & { id?: string })[] {
    const current = layers.find((l) => l.sceneIndex === sceneIdx);
    if (!current?.src || (current.type !== "image" && current.type !== "video")) return [];
    return [{ type: current.type, src: current.src, thumbnailUrl: null, label: null }];
  }

  function buildLayer(src: string, type: "image" | "video", sceneIdx: number): VisualLayer | null {
    const scene = scenes[sceneIdx];
    if (!scene) return null;
    // Videos already carry their own motion; only stills get a Ken Burns move.
    return { id: nanoid(8), type, src, startMs: scene.startMs, endMs: scene.endMs, fit: "cover", kenBurns: type === "video" ? "none" : "in", opacity: 1, sceneIndex: sceneIdx };
  }

  /**
   * Imported files, in the order they were picked: the first on the selected
   * scene (the hook when none is), the next ones on the scenes after it. Each
   * file used to land on that same scene, the next replacing the last, so
   * five photos left one on the hook and four to place by hand. The CTA keeps
   * its rule — it shows the last scene's still — unless it is the scene picked;
   * files beyond the last scene wait in the project's library. One commit for
   * the lot: separate ones would each start from the same layers and keep
   * only the last.
   */
  function placeInOrder(sent: Asset[]) {
    const start = selectedScene ?? 0;
    if (!scenes[start]) {
      remember(...sent.map((a) => ({ type: a.type === "VIDEO" ? ("video" as const) : ("image" as const), src: a.url, thumbnailUrl: null, label: a.name })));
      return toast.error("Générez d'abord un script pour que les scènes existent : les fichiers sont dans la bibliothèque.");
    }
    const cta = ctaSceneIndex(scenes.length);
    const slots = start === cta ? [start] : scenes.map((_, i) => i).filter((i) => i >= start && i !== cta);
    const placed: VisualLayer[] = [];
    const displaced: (Omit<VisualPoolItem, "id"> & { id?: string })[] = [];
    const kept: (Omit<VisualPoolItem, "id"> & { id?: string })[] = [];
    sent.forEach((asset, n) => {
      const type = asset.type === "VIDEO" ? "video" : "image";
      kept.push({ type, src: asset.url, thumbnailUrl: null, label: asset.name });
      const slot = slots[n];
      if (slot === undefined) return;
      const layer = buildLayer(asset.url, type, slot);
      if (!layer) return;
      displaced.push(...occupantOf(slot));
      placed.push(layer);
    });
    const filled = new Set(placed.map((l) => l.sceneIndex));
    let next = [...layers.filter((l) => !filled.has(l.sceneIndex)), ...placed];
    // A CTA still empty follows the last scene, as it does after an AI batch.
    if (cta !== null && !next.some((l) => l.sceneIndex === cta)) {
      const copy = ctaCopyOf(next, scenes);
      if (copy) next = [...next, copy];
    }
    remember(...displaced, ...kept);
    onLayersChange(next);
    const extra = sent.length - placed.length;
    const last = placed[placed.length - 1]?.sceneIndex ?? start;
    const where = placed.length === 1 ? `Visuel ajouté ${sceneLabel(start)}` : `${placed.length} visuels placés : ${sceneName(start)} → ${sceneName(last)}`;
    toast.success(`${where}${extra > 0 ? ` · ${extra} de plus dans la bibliothèque du projet` : ""}`);
  }

  /** One imported file, tapped in the list: on the selected scene, replacing what is there. */
  function addLayer(asset: Asset) {
    const sceneIdx = selectedScene ?? 0;
    const type = asset.type === "VIDEO" ? "video" : "image";
    const layer = buildLayer(asset.url, type, sceneIdx);
    if (!layer) return toast.error("Générez d'abord un script pour que les scènes existent.");
    remember(...occupantOf(sceneIdx), { type, src: asset.url, thumbnailUrl: null, label: asset.name });
    onLayersChange([...layers.filter((l) => l.sceneIndex !== sceneIdx), layer]);
    toast.success(`Visuel ajouté ${sceneLabel(sceneIdx)}`);
  }

  function addStock(result: StockResult) {
    const sceneIdx = selectedScene ?? 0;
    const layer = buildLayer(result.url, result.type, sceneIdx);
    if (!layer) return toast.error("Générez d'abord un script pour que les scènes existent.");
    remember(...occupantOf(sceneIdx), { type: result.type, src: result.url, thumbnailUrl: result.thumbnailUrl, label: result.author });
    onLayersChange([...layers.filter((l) => l.sceneIndex !== sceneIdx), layer]);
    toast.success(`Visuel ajouté ${sceneLabel(sceneIdx)}`);
  }

  /** Place a remembered visual on the selected scene, replacing what is there. */
  function placeFromPool(item: VisualPoolItem) {
    const sceneIdx = selectedScene ?? 0;
    const layer = buildLayer(item.src, item.type, sceneIdx);
    if (!layer) return toast.error("Générez d'abord un script pour que les scènes existent.");
    remember(...occupantOf(sceneIdx));
    onLayersChange([...layers.filter((l) => l.sceneIndex !== sceneIdx), layer]);
    toast.success(`Visuel placé ${sceneLabel(sceneIdx)}`);
  }

  /**
   * Send a layer to another scene, swapping with whatever is already there
   * rather than overwriting it — a swap loses nothing, and getting a visual
   * onto the right scene should never cost you the one it displaces.
   */
  function moveLayer(id: string, target: number) {
    const layer = layers.find((l) => l.id === id);
    const to = scenes[target];
    if (!layer || !to || layer.sceneIndex === target) return;
    const from = layer.sceneIndex;
    const occupant = layers.find((l) => l.sceneIndex === target && l.id !== id);
    const origin = from === undefined ? null : scenes[from];

    onLayersChange(
      layers.map((l) => {
        if (l.id === id) return { ...l, sceneIndex: target, startMs: to.startMs, endMs: to.endMs };
        if (occupant && l.id === occupant.id && origin && from !== undefined) {
          return { ...l, sceneIndex: from, startMs: origin.startMs, endMs: origin.endMs };
        }
        return l;
      }),
    );

    if (occupant && origin && from !== undefined) toast.success(`${sceneName(from)} ↔ ${sceneName(target)} échangés`);
    else toast.success(`Visuel déplacé vers ${sceneName(target)}`);
  }

  async function searchStock(query: string) {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/stock/search?q=${encodeURIComponent(query)}&type=video`);
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "Recherche impossible");
      setStockResults(json.results ?? []);
      if (!json.results?.length) toast.info("Aucun résultat. Un terme très spécifique (un mouvement, une technique précise) n'existe souvent dans aucune banque d'images généraliste — essayez un mot plus large (ex. « callisthénie » plutôt que le nom exact d'une figure).");
    } finally {
      setSearching(false);
    }
  }

  const style = (visualStyle || defaultVisualStyle) as VisualStyle;
  const emptyScenes = scenes.map((_, i) => i).filter((i) => !layers.some((l) => l.sceneIndex === i));
  /** The call to action keeps the last scene's image on screen instead of its own (lib/pipeline/cta-image): it is never drawn in a batch. */
  const cta = ctaSceneIndex(scenes.length);
  const drawable = emptyScenes.filter((i) => i !== cta);
  const drawableCount = scenes.length - (cta === null ? 0 : 1);

  /** The CTA tile's "Même image que…": the last scene's still on a layer of its own, with the CTA's own timing. */
  function sameImageForCta() {
    const copy = ctaCopyOf(layers, scenes);
    if (!copy || cta === null) return;
    onLayersChange([...layers.filter((l) => l.sceneIndex !== cta), copy]);
    toast.success(`CTA : même image que ${sceneName(cta - 1)}`);
  }

  /** The first drawings kept when an automatic correction replaced them, as library entries (lib/ai/checked-image `draft`). */
  const draftEntries = (drafts: { index: number; url: string }[]) => drafts.map((d) => ({ type: "image" as const, src: d.url, thumbnailUrl: null, label: `${sceneName(d.index)} · 1re version` }));

  /**
   * AI visuals for the scenes still missing one, or every scene when `mode`
   * is "all" — the video's own version of the carousel's series generation.
   * The server reads this project's current style, motif and scenes, so
   * unsaved edits go first; only the returned layers are taken back, the
   * same way the carousel editor's own generation does, so anything typed
   * while the request was in flight stays.
   */
  async function generateAiVisuals(mode: "missing" | "all") {
    if (!scenes.length) return toast.error("Générez d'abord un script pour que les scènes existent.");
    setGeneratingAi(true);
    try {
      if (!(await ensureSaved())) return;
      const res = await generateProjectVisualsAiAction(projectId, mode, admin ? imageModel : undefined);
      if (!res.ok) return toast.error(res.error);
      const { generated, failed, layers: newLayers, visualStyle: usedStyle, captionStyle: newCaptionStyle, ctaFilled, drafts } = res.data;
      if (drafts.length) remember(...draftEntries(drafts));
      onLayersChange(newLayers);
      onVisualStyleChange(usedStyle);
      if (newCaptionStyle) onCaptionStyleChange(newCaptionStyle);
      if (!generated && !ctaFilled) return void toast.info("Toutes les scènes ont déjà une image.");
      toast.success(
        (generated ? `${generated} visuel${generated > 1 ? "s" : ""} créé${generated > 1 ? "s" : ""}` : "Le CTA reprend l'image de la dernière scène") +
          (generated && ctaFilled ? " · le CTA reprend l'image de la dernière scène" : "") +
          (failed ? ` · ${failed} échec${failed > 1 ? "s" : ""}, crédits remboursés` : "") +
          (newCaptionStyle ? " · sous-titres accordés au style" : "") +
          (drafts.length ? ` · ${drafts.length} retouche${drafts.length > 1 ? "s" : ""} automatique${drafts.length > 1 ? "s" : ""} : la 1re version est dans la bibliothèque du projet` : ""),
      );
      router.refresh();
    } finally {
      setGeneratingAi(false);
    }
  }

  /**
   * One scene's AI image, on its own — the empty tile's "Créer", or "Refaire"
   * on a tile that already has one (an imported image too: asked first). The
   * other scenes are never touched; the new image follows a neighbouring scene's
   * look (lib/pipeline/ai-visuals neighbourReference). A replaced image stays
   * in the project library, like every replacement here.
   */
  async function generateOneScene(i: number) {
    const existing = layers.find((l) => l.sceneIndex === i);
    if (existing && !window.confirm(`Remplacer l'image de « ${sceneName(i)} » par une nouvelle image IA ?${aiImageCost > 0 ? ` ${aiImageCost} crédits.` : ""} L'ancienne reste dans la bibliothèque du projet.`)) return;
    setGeneratingAi(true);
    setSceneBusy(i);
    try {
      if (!(await ensureSaved())) return;
      const res = await generateProjectVisualsAiAction(projectId, "missing", admin ? imageModel : undefined, i);
      if (!res.ok) return toast.error(res.error);
      const { layers: newLayers, visualStyle: usedStyle, captionStyle: newCaptionStyle, drafts } = res.data;
      // One call: the replaced image and the first drawing are remembered together.
      remember(...(existing ? occupantOf(i) : []), ...draftEntries(drafts));
      onLayersChange(newLayers);
      onVisualStyleChange(usedStyle);
      if (newCaptionStyle) onCaptionStyleChange(newCaptionStyle);
      toast.success(`${sceneName(i)} : nouvelle image créée${drafts.length ? " · retouche automatique : la 1re version est dans la bibliothèque du projet" : ""}`);
      router.refresh();
    } finally {
      setSceneBusy(null);
      setGeneratingAi(false);
    }
  }

  /** Fill every scene that has no visual yet, keeping anything already placed. */
  async function autoFill() {
    const empty = scenes.map((_, i) => i).filter((i) => !layers.some((l) => l.sceneIndex === i));
    if (!scenes.length) return toast.error("Générez d'abord un script pour que les scènes existent.");
    if (!empty.length) return toast.info("Toutes les scènes ont déjà un visuel. Supprimez-en un pour le régénérer.");

    setAutoFilling(true);
    try {
      // Everything this project has already shown — on a scene, taken off one,
      // or turned down. The catalogs return the same order for the same query,
      // so anything not listed here comes straight back as the first hit.
      const used = new Set([...layers.map((l) => l.src), ...pool.map((p) => p.src)]);
      const res = await fetch("/api/stock/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: empty.map((i) => sceneQueries[i] ?? ""), type: "video", exclude: [...used].slice(0, 300) }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "Génération impossible");

      const added: VisualLayer[] = [];
      // Auto-filled picks are remembered too: without this they exist only as a
      // URL inside a layer, and taking one off a scene puts it out of reach.
      const remembered: VisualPoolItem[] = [];
      (json.matches as StockResult[][]).forEach((candidates, k) => {
        const fresh = candidates.filter((c) => !used.has(c.url));
        if (!fresh.length) return;
        const pick = fresh[0];
        used.add(pick.url);
        const layer = buildLayer(pick.url, pick.type, empty[k]);
        if (layer) { added.push(layer); remembered.push({ id: nanoid(8), type: pick.type, src: pick.url, thumbnailUrl: pick.thumbnailUrl, label: pick.author }); }
      });

      if (!added.length) return toast.error("Plus de visuel inédit pour ces scènes. Utilisez la recherche manuelle ci-dessus.");
      onLayersChange([...layers, ...added]);
      remember(...remembered);
      const missing = empty.length - added.length;
      toast.success(
        `${added.length} visuel${added.length > 1 ? "s" : ""} ajouté${added.length > 1 ? "s" : ""}.` +
          (missing > 0 ? ` ${missing} scène${missing > 1 ? "s" : ""} sans résultat inédit — cherchez manuellement.` : ""),
      );
    } finally {
      setAutoFilling(false);
    }
  }

  const update = (id: string, patch: Partial<VisualLayer>) => onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  /**
   * Take a visual off its scene. It stays in the project library, so placing
   * it again is one tap there; auto-fill, whose job is proposing something new,
   * skips it because it is in the library.
   */
  function remove(id: string) {
    const layer = layers.find((l) => l.id === id);
    if (layer?.src && (layer.type === "image" || layer.type === "video")) {
      remember({ type: layer.type, src: layer.src, thumbnailUrl: null, label: null });
    }
    onLayersChange(layers.filter((l) => l.id !== id));
    toast.success("Retiré — « Remplir » proposera un autre visuel. Celui-ci reste dans la bibliothèque du projet.");
  }

  /**
   * The explicit "not this one": off every scene and out of the library. It is
   * kept in the saved pool, flagged, so the refusal survives a reload.
   */
  function banish(item: VisualPoolItem) {
    onPoolChange(pool.map((p) => (p.id === item.id ? { ...p, rejected: true } : p)));
    onLayersChange(layers.filter((l) => l.src !== item.src));
    toast.success("Visuel écarté — il ne sera plus proposé.");
  }

  return (
    <div className="space-y-3">
      {/*
        Order is the working order: the video's images first, with what can be
        done to each one (animate it, take it off) right on it; then the AI
        images that fill them; then the other sources; then the fine settings.
        "Animer" used to sit three taps deep in a folded "Calques" list.
      */}
      {scenes.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide">Images de la vidéo</p>
            <p className="text-[11px] text-muted-foreground">{scenes.length - emptyScenes.length}/{scenes.length}</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {scenes.map((_, i) => {
              const layer = layers.find((l) => l.sceneIndex === i);
              const job = layer ? clipJobs[layer.id] : undefined;
              const animating = Boolean(job);
              const animateCost = layer ? (klingDurationFor(layer.endMs - layer.startMs) === "10" ? videoClipCosts.standardLong : videoClipCosts.standard) : 0;
              return (
                <div key={i} className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectScene?.(i)}
                    className={cn("relative block aspect-[9/16] w-full overflow-hidden rounded-lg border-2 bg-white/[0.03]", selectedScene === i ? "border-primary" : layer ? "border-transparent" : "border-dashed border-white/15")}
                    aria-label={`${sceneName(i)}${layer ? "" : " (vide)"}`}
                  >
                    {layer?.type === "video" && layer.src ? (
                      // "#t=0.1" makes Safari paint the first frame instead of a black tile.
                      <video src={`${layer.src}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    ) : layer?.src ? (
                      <img src={layer.src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">Vide</span>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-semibold text-white">{sceneName(i)}</span>
                    {/* An animated AI image keeps its "ai:" source; a stock or imported clip has none. */}
                    {layer?.type === "video" && <span className={cn("absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold text-white", isAiSource(layer.source) ? "bg-emerald-500/80" : "bg-black/60")}><Film className="h-2.5 w-2.5" /> {isAiSource(layer.source) ? "Animée" : "Vidéo"}</span>}
                    {(animating || sceneBusy === i) && (
                      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-[10px] text-white">
                        <Loader2 className="h-4 w-4 animate-spin" /> {sceneBusy === i ? "Création…" : job?.status === "PREPARING" ? "Préparation…" : "Animation…"}
                      </span>
                    )}
                  </button>
                  {layer?.src && !animating && (
                    // A real link to the stored file: the image is the owner's, and the phone saves it in one tap.
                    <a
                      href={layer.src}
                      download={`${sceneName(i).toLowerCase().replace(/\s+/g, "-")}.${layer.type === "video" ? "mp4" : "jpg"}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Télécharger l'image ${sceneLabel(i)}`}
                      className="absolute right-1 top-9 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/90"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {layer && !animating && (
                    // Beside the tile button, not inside it: one tap removes, it never also selects the scene.
                    <button
                      type="button"
                      onClick={() => remove(layer.id)}
                      aria-label={`Retirer l'image ${sceneLabel(i)}`}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-500/80"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {layer?.type === "image" && videoClipsConfigured && !animating && (
                    <Button size="sm" variant="secondary" className="mt-1 h-7 w-full gap-1 px-1 text-[11px]" disabled={credits < animateCost} onClick={() => animateScene(layer.id, "standard")}>
                      <Wand2 className="h-3 w-3" /> Animer{animateCost > 0 && <> · {animateCost}</>}
                    </Button>
                  )}
                  {!layer && i === cta && ctaCopyOf(layers, scenes) && (
                    <Button size="sm" variant="secondary" className="mt-1 h-auto min-h-7 w-full gap-1 whitespace-normal px-1 py-1 text-[11px] leading-tight" onClick={sameImageForCta}>
                      <Copy className="h-3 w-3 shrink-0" /> Même image que {sceneName(i - 1)}
                    </Button>
                  )}
                  {!layer && gemini.briefs[i]?.trim() && (
                    <div className="mt-1 space-y-1">
                      {aiImagesConfigured && i !== cta && (
                        <Button size="sm" variant="secondary" className="h-7 w-full gap-1 px-1 text-[11px]" loading={sceneBusy === i} disabled={generatingAi || credits < aiImageCost} onClick={() => generateOneScene(i)}>
                          <Wand2 className="h-3 w-3" /> Créer{aiImageCost > 0 && <> · {aiImageCost}</>}
                        </Button>
                      )}
                      {/* The same prompt "Créer" would send (lib/pipeline/ai-visuals), for the Gemini or ChatGPT app — the owner's alone: for subscribers the AI images are the product, one tap away. */}
                      {admin && <CopyForGemini className="w-full" cast={gemini.cast} prompt={geminiPrompt(composeImagePrompt({ scene: gemini.briefs[i], motif: visualMotif, style, layout: "frame", purpose: "video" }), { aspect: gemini.aspect, cast: gemini.cast })} />}
                    </div>
                  )}
                  {layer && !animating && aiImagesConfigured && i !== cta && gemini.briefs[i]?.trim() && (
                    <Button size="sm" variant="ghost" className="mt-1 h-6 w-full gap-1 px-1 text-[11px] text-muted-foreground" disabled={generatingAi || credits < aiImageCost} onClick={() => generateOneScene(i)}>
                      <RefreshCw className="h-3 w-3" /> Refaire{aiImageCost > 0 && <> · {aiImageCost}</>}
                    </Button>
                  )}
                  {animating && layer && job?.jobId && (
                    <Button size="sm" variant="ghost" className="mt-1 h-7 w-full px-1 text-[11px] text-red-300" onClick={() => cancelAnimate(layer.id)}>Annuler</Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {videoClipsConfigured ? "« Animer » transforme l'image en clip vidéo (plusieurs minutes) ; le mouvement est écrit automatiquement d'après l'image et le texte de la scène. " : ""}
            Touche une image pour la choisir : la banque d&apos;images, tes fichiers et la bibliothèque la remplacent. Le × la retire (elle reste dans la bibliothèque du projet). Sur une case vide, « Créer » dessine cette seule scène{admin ? " ; « Copier la description » copie sa description pour la coller dans Gemini ou ChatGPT, puis touche la case et « Importer un fichier »" : ""}. « Refaire » remplace une image par une nouvelle.
          </p>
        </div>
      )}

      {aiImagesConfigured && (
        <Section title="Images IA" icon={Wand2} summary={drawable.length ? `${drawable.length} à créer` : "Toutes créées"} defaultOpen={drawable.length > 0}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Direction artistique</Label>
              <StylePicker value={style} onChange={onVisualStyleChange} />
            </div>
            <CharacterReference projectId={projectId} initial={characterReference} generate={{ description: visualMotif, cost: aiImageCost, enabled: aiImagesConfigured }} />

            {drawable.length > 0 ? (
              <Button variant="gradient" className="w-full" onClick={() => generateAiVisuals("missing")} loading={generatingAi} disabled={!hasScript || autoFilling || credits < drawable.length * aiImageCost}>
                <Wand2 /> Créer {drawable.length} image{drawable.length > 1 ? "s" : ""} IA {aiImageCost > 0 && <><Coins className="h-3.5 w-3.5" /> {drawable.length * aiImageCost}</>}
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => window.confirm(`Recréer les ${drawableCount} images de la vidéo ?${aiImageCost > 0 ? ` ${drawableCount * aiImageCost} crédits.` : ""}${cta === null ? "" : " Le CTA reprendra l'image de la dernière scène."}`) && generateAiVisuals("all")}
                loading={generatingAi}
                disabled={!hasScript || autoFilling || !scenes.length || credits < drawableCount * aiImageCost}
              >
                <RefreshCw /> Tout recréer {aiImageCost > 0 && <><Coins className="h-3.5 w-3.5" /> {drawableCount * aiImageCost}</>}
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              {drawable.length > 0
                ? "Seules les scènes vides sont créées : celles qui ont déjà une image ne sont jamais touchées. Le CTA garde l'image de la dernière scène, sans image en plus."
                : "Pour changer une seule image : « Refaire » sur sa case. Le CTA garde l'image de la dernière scène."}
            </p>

            <details className="group rounded-lg border border-white/[0.06] p-2.5">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
                <span className="inline-flex items-center gap-1"><ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /> Réglages avancés {admin ? "· fil conducteur, modèle d'image" : "· fil conducteur"}</span>
              </summary>
              <div className="mt-3 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between"><Label>Fil conducteur <span className="font-normal normal-case text-muted-foreground">· le décor et qui apparaît</span></Label><span className="text-[11px] text-muted-foreground">{visualMotif.length}/800</span></div>
                  <Textarea
                    value={visualMotif}
                    maxLength={800}
                    rows={3}
                    placeholder="Ex. : un homme d'une trentaine d'années, brun, débardeur noir uni, dans une salle de street workout sombre"
                    onChange={(e) => onMotifChange(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Écrit automatiquement avec le script. L&apos;apparence des personnages vient de l&apos;image de référence ; ce texte décrit surtout le décor commun.</p>
                  {admin && (
                    <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-3">
                      <p className="text-xs font-semibold text-amber-200">Admin · descriptions d&apos;image des scènes</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Les descriptions de scène sont écrites une fois avec le script : changer le fil conducteur ne les touche pas. Ce bouton les réécrit toutes d&apos;après le fil conducteur actuel (un lieu différent par scène). Texte parlé inchangé, voix off conservée. Un appel Claude, quelques centimes. Ensuite, « Refaire » les images voulues.</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Button size="sm" variant="secondary" loading={rewriting} disabled={rewriting || !visualMotif.trim()} onClick={rewriteBriefs}>
                          <Wand2 /> Réécrire les descriptions d&apos;image
                        </Button>
                        {previousBriefs && (
                          <Button size="sm" variant="ghost" onClick={restoreBriefs}>Revenir aux anciennes descriptions</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {admin && <ImageModelPicker value={imageModel} onChange={setImageModel} note="Visible par toi seul ; tes clients sont sur Nano Banana 2. Le même choix que dans le carrousel : « Mélange » garde Pro pour la 1re scène, qui fixe le style des suivantes." />}
              </div>
            </details>
          </div>
        </Section>
      )}

      <Section title="Banque d'images" icon={Search} summary="Photos et vidéos réelles" defaultOpen={!aiImagesConfigured}>
        {stockConfigured ? (
          <>
            <p className="text-[11px] text-muted-foreground">De vraies photos et vidéos libres de droits, à la place des images IA. Le choix va sur : <span className="font-medium text-foreground">{sceneName(selectedScene ?? 0)}</span>.</p>
            <Button className="mt-2 w-full" variant={aiImagesConfigured ? "secondary" : "gradient"} onClick={autoFill} loading={autoFilling} disabled={!scenes.length}>
              <Sparkles /> Remplir les scènes vides
            </Button>
            <div className="mt-2 flex gap-2">
              <Input
                value={stockQuery}
                onChange={(e) => setStockQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchStock(stockQuery)}
                placeholder="Ou cherchez : ex. ville la nuit"
                className="h-9 text-sm"
              />
              <Button variant="outline" size="icon" onClick={() => searchStock(stockQuery)} loading={searching} aria-label="Rechercher"><Search /></Button>
            </div>
            {stockResults.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {stockResults.map((r) => (
                  <button key={r.id} onClick={() => addStock(r)} className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-white/10 bg-white/5" title={`${r.author} · banque d'images`}>
                    <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-white">{r.type === "video" ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Clé <code>PEXELS_API_KEY</code> manquante — la recherche automatique de visuels est désactivée. Vous pouvez toujours importer vos propres fichiers.
          </p>
        )}
      </Section>

      <Section title="Importer un fichier" icon={Upload} summary={assets.length ? `${assets.length} importé${assets.length > 1 ? "s" : ""}` : "Aucun"}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition", dragOver ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/20")}
        >
          <input ref={fileRef} type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-brand-300" /> : <Upload className="h-6 w-6 text-brand-300" />}
          <p className="mt-2 text-sm font-medium">Déposez des images ou clips</p>
          <p className="text-[11px] text-muted-foreground">PNG, JPG, WebP, MP4 · jusqu&apos;à 50 Mo</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Plusieurs à la fois : dans l&apos;ordre choisi, la 1re va sur {sceneName(selectedScene ?? 0) === "Hook" ? "le hook" : sceneName(selectedScene ?? 0).toLowerCase()}, les suivantes sur les scènes d&apos;après.</p>
          {uploading && (
            <div className="mt-3 w-full" onClick={(e) => e.stopPropagation()}>
              <Progress value={Math.round(uploading.fraction * 100)} className="h-1.5" indicatorClassName="bg-brand-gradient" />
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                {uploading.total > 1 && `${uploading.done + 1}/${uploading.total} · `}
                {uploading.phase === "converting" ? "Conversion" : "Envoi"} · {uploading.name} · {Math.round(uploading.fraction * 100)} %
              </p>
            </div>
          )}
        </div>
        {assets.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {assets.slice(0, 16).map((a) => (
              <div key={a.id} className="relative">
                <button onClick={() => addLayer(a)} disabled={deleting === a.id} className="group relative aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-white/5 disabled:opacity-40" title={a.name}>
                  {a.type === "VIDEO" ? <video src={a.url} muted className="h-full w-full object-cover" /> : <img src={a.url} alt="" className="h-full w-full object-cover" />}
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-white">{a.type === "VIDEO" ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void deleteAsset(a); }}
                  disabled={deleting === a.id}
                  aria-label={`Supprimer ${a.name}`}
                  title="Supprimer définitivement"
                  className="absolute -right-1 -top-1 rounded-full border border-white/10 bg-background p-1 text-muted-foreground hover:text-red-300 disabled:opacity-40"
                >
                  {deleting === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {library.length > 0 && (
        <Section title="Bibliothèque du projet" icon={LibraryBig} count={library.length}>
          <p className="text-[11px] text-muted-foreground">Touchez pour placer sur la scène choisie.</p>
          <ul className="mt-2 grid grid-cols-4 gap-2">
            {library.map((item) => {
              const inUse = layers.some((l) => l.src === item.src);
              return (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => placeFromPool(item)}
                    title={item.label ?? item.src}
                    className={cn("group relative block aspect-[9/16] w-full overflow-hidden rounded-lg border bg-white/5", inUse ? "border-primary/60" : "border-white/10 hover:border-white/25")}
                  >
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : item.type === "video" ? (
                      <video src={item.src} muted preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      <img src={item.src} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-white">{item.type === "video" ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}</span>
                    {inUse && <span className="absolute bottom-1 left-1 h-2 w-2 rounded-full bg-primary" title="Déjà placé sur une scène" />}
                    {item.label?.endsWith("1re version") && <span className="absolute inset-x-0 top-0 bg-black/60 px-1 py-0.5 text-center text-[9px] font-semibold leading-tight text-white">{item.label}</span>}
                  </button>
                  <a
                    href={item.src}
                    download={`${(item.label ?? "image").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${item.type === "video" ? "mp4" : "jpg"}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Télécharger"
                    title="Télécharger"
                    className="absolute -bottom-1 -left-1 rounded-full border border-white/10 bg-background p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => banish(item)}
                    aria-label="Écarter ce visuel"
                    title="Écarter : le retire et cesse de le proposer"
                    className="absolute -right-1 -top-1 rounded-full border border-white/10 bg-background p-1 text-muted-foreground hover:text-red-300"
                  >
                    <Ban className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Placement et mouvement" icon={Layers} count={layers.length}>
        {layers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun calque visuel. Le fond animé s&apos;affiche derrière les sous-titres.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...layers].sort((a, b) => a.startMs - b.startMs).map((l) => (
              <LayerRow
                key={l.id}
                layer={l}
                sceneCount={scenes.length}
                sceneName={sceneName}
                onMove={(target) => moveLayer(l.id, target)}
                onUpdate={(patch) => update(l.id, patch)}
                onRemove={() => remove(l.id)}
                videoClipsConfigured={videoClipsConfigured}
                videoClipCosts={videoClipCosts}
                credits={credits}
                clipJob={clipJobs[l.id] ?? null}
                onAnimate={(tier) => animateScene(l.id, tier)}
                onCancelAnimate={() => cancelAnimate(l.id)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Fond" icon={Palette} summary={backgroundLabel(background)}>
        <BackgroundControls value={background} onChange={onBackgroundChange} />
      </Section>
    </div>
  );
}

/**
 * One visual on one scene.
 *
 * Scene, timing and removal stay on the row — that is what actually gets
 * changed. Animation and fit sit behind the chevron: two dropdowns each, on
 * every layer, turned a seven-scene project into a wall of twenty-one
 * identical controls for settings almost nobody revisits.
 */
function LayerRow({
  layer,
  sceneCount,
  sceneName,
  onMove,
  onUpdate,
  onRemove,
  videoClipsConfigured,
  videoClipCosts,
  credits,
  clipJob,
  onAnimate,
  onCancelAnimate,
}: {
  layer: VisualLayer;
  sceneCount: number;
  sceneName: (i: number) => string;
  onMove: (target: number) => void;
  onUpdate: (patch: Partial<VisualLayer>) => void;
  onRemove: () => void;
  videoClipsConfigured: boolean;
  videoClipCosts: { standard: number; standardLong: number; pro: number; proLong: number };
  credits: number;
  clipJob: { jobId: string; status: string } | null;
  onAnimate: (tier: VideoClipTier) => void;
  onCancelAnimate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const animating = clipJob !== null;
  const isLong = klingDurationFor(layer.endMs - layer.startMs) === "10";
  const animateCost = { standard: isLong ? videoClipCosts.standardLong : videoClipCosts.standard, pro: isLong ? videoClipCosts.proLong : videoClipCosts.pro };

  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div className="flex items-center gap-2">
        <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded bg-white/5">
          {layer.type === "video" ? <video src={layer.src} muted className="h-full w-full object-cover" /> : layer.src ? <img src={layer.src} alt="" className="h-full w-full object-cover" /> : null}
          {animating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
            </div>
          )}
        </div>
        <Select value={String(layer.sceneIndex ?? 0)} onValueChange={(v) => onMove(Number(v))}>
          <SelectTrigger className="h-7 w-24 shrink-0 text-[11px]" aria-label="Scène du visuel"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: sceneCount }, (_, i) => (
              <SelectItem key={i} value={String(i)}>{sceneName(i)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{(layer.startMs / 1000).toFixed(1)}–{(layer.endMs / 1000).toFixed(1)}s</span>
        <Button size="icon-sm" variant="ghost" aria-label="Réglages du calque" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
        <Button size="icon-sm" variant="ghost" className="text-red-300" aria-label="Retirer de la scène" onClick={onRemove}><Trash2 /></Button>
      </div>
      {open && (
        <div className="mt-2 flex gap-1 border-t border-white/[0.06] pt-2">
          <Select value={layer.kenBurns} onValueChange={(v) => onUpdate({ kenBurns: v as VisualLayer["kenBurns"] })}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="in">Zoom avant</SelectItem><SelectItem value="out">Zoom arrière</SelectItem><SelectItem value="pan-left">Panoramique gauche</SelectItem><SelectItem value="pan-right">Panoramique droite</SelectItem><SelectItem value="none">Statique</SelectItem></SelectContent>
          </Select>
          <Select value={layer.fit} onValueChange={(v) => onUpdate({ fit: v as VisualLayer["fit"] })}>
            <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="cover">Remplir</SelectItem><SelectItem value="contain">Ajuster</SelectItem></SelectContent>
          </Select>
        </div>
      )}
      {open && videoClipsConfigured && layer.type === "video" && (
        <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-muted-foreground">
          Ce calque est déjà une vidéo (mouvement déjà présent) — rien à animer ici.
        </div>
      )}
      {open && videoClipsConfigured && layer.type === "image" && (
        <div className="mt-2 border-t border-white/[0.06] pt-2">
          {animating ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Animation en cours — jusqu'à plusieurs minutes…</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-red-300" onClick={onCancelAnimate}>Annuler</Button>
            </div>
          ) : (
            <>
              {klingDurationFor(layer.endMs - layer.startMs) === "10" && (
                <p className="mb-1.5 text-[10px] text-amber-300/80">Scène de plus de 5s : un clip 10s est généré (coût plus élevé) pour couvrir toute la durée.</p>
              )}
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" className="h-7 flex-1 gap-1 text-[11px]" disabled={credits < animateCost.standard} onClick={() => onAnimate("standard")}>
                  <Wand2 className="h-3 w-3" /> Animer <Coins className="h-3 w-3" /> {animateCost.standard}
                </Button>
                <Button size="sm" variant="secondary" className="h-7 flex-1 gap-1 text-[11px]" disabled={credits < animateCost.pro} onClick={() => onAnimate("pro")}>
                  <Wand2 className="h-3 w-3" /> Qualité sup. <Coins className="h-3 w-3" /> {animateCost.pro}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
