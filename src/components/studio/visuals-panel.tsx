"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Image as ImageIcon, Film, Trash2, Layers, Palette, Loader2, Sparkles, Search, Ban, LibraryBig, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VisualLayer, VisualPoolItem, BackgroundStyle } from "@/lib/validations";
import type { ShortVideoProps } from "@/lib/render/props";
import { Progress } from "@/components/ui/progress";
import { uploadAsset } from "@/lib/assets/upload-client";
import { probeVideo, convertVideo, canConvert } from "@/lib/assets/video-compat";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { BackgroundControls, backgroundLabel } from "@/components/studio/background-controls";

interface Asset { id: string; type: string; url: string; name: string; mimeType: string }
interface StockResult { id: string; type: "image" | "video"; url: string; thumbnailUrl: string; author: string; durationSec: number | null }

interface Props {
  layers: VisualLayer[];
  /** Visuals this project has chosen, whether or not they sit on a scene. */
  pool: VisualPoolItem[];
  background: BackgroundStyle;
  scenes: ShortVideoProps["scenes"];
  /** Stock search terms suggested by the AI, one per composition scene. */
  sceneQueries: string[];
  stockConfigured: boolean;
  selectedScene: number | null;
  onLayersChange: (l: VisualLayer[]) => void;
  onPoolChange: (p: VisualPoolItem[]) => void;
  onBackgroundChange: (b: BackgroundStyle) => void;
}

export function VisualsPanel({ layers, pool, background, scenes, sceneQueries, stockConfigured, selectedScene, onLayersChange, onPoolChange, onBackgroundChange }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ name: string; done: number; total: number; fraction: number; phase: "converting" | "uploading" } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Deleting a visual means "not this one" — auto-fill must not hand it back.
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/assets/upload").then((r) => r.json()).then((j) => setAssets((j.assets ?? []).filter((a: Asset) => a.type === "IMAGE" || a.type === "VIDEO"))).catch(() => undefined);
  }, []);

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
        addLayer(asset);
      } catch (err) {
        toast.error(`${original.name} : ${err instanceof Error ? err.message : "échec de l'envoi"}`);
      }
    }
    setUploading(null);
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
    const fresh: VisualPoolItem[] = [];
    for (const item of items) {
      if (!item.src || seen.has(item.src)) continue;
      seen.add(item.src);
      fresh.push({ ...item, id: item.id ?? nanoid(8) });
    }
    if (fresh.length) onPoolChange([...fresh, ...pool]);
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

  function addLayer(asset: Asset) {
    const sceneIdx = selectedScene ?? 0;
    const type = asset.type === "VIDEO" ? "video" : "image";
    const layer = buildLayer(asset.url, type, sceneIdx);
    if (!layer) return toast.error("Générez d'abord un script pour que les scènes existent.");
    remember(...occupantOf(sceneIdx), { type, src: asset.url, thumbnailUrl: null, label: asset.name });
    onLayersChange([...layers.filter((l) => l.sceneIndex !== sceneIdx), layer]);
    toast.success(`B-roll ajouté ${sceneLabel(sceneIdx)}`);
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

  /** Fill every scene that has no visual yet, keeping anything already placed. */
  async function autoFill() {
    const empty = scenes.map((_, i) => i).filter((i) => !layers.some((l) => l.sceneIndex === i));
    if (!scenes.length) return toast.error("Générez d'abord un script pour que les scènes existent.");
    if (!empty.length) return toast.info("Toutes les scènes ont déjà un visuel. Supprimez-en un pour le régénérer.");

    setAutoFilling(true);
    try {
      const res = await fetch("/api/stock/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: empty.map((i) => sceneQueries[i] ?? ""), type: "video" }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "Génération impossible");

      const used = new Set([...layers.map((l) => l.src), ...rejected]);
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
   * Take a visual off its scene. Deliberately does NOT blacklist it: this used
   * to be the only way to move a clip, so refusing it here meant the auto-fill
   * actively avoided the very clip you were trying to reuse.
   */
  function remove(id: string) {
    const layer = layers.find((l) => l.id === id);
    if (layer?.src && (layer.type === "image" || layer.type === "video")) {
      remember({ type: layer.type, src: layer.src, thumbnailUrl: null, label: null });
    }
    onLayersChange(layers.filter((l) => l.id !== id));
    toast.success("Retiré de la scène — le visuel reste dans la bibliothèque du projet.");
  }

  /** The explicit "not this one": drop it and stop the auto-fill proposing it. */
  function banish(item: VisualPoolItem) {
    setRejected((r) => new Set(r).add(item.src));
    onPoolChange(pool.filter((p) => p.id !== item.id));
    onLayersChange(layers.filter((l) => l.src !== item.src));
    toast.success("Visuel écarté — il ne sera plus proposé automatiquement.");
  }

  return (
    <div className="space-y-3">
      {/*
        Order is the working order, not the data model's: what a scene needs
        first sits open at the top, and everything set once or checked
        occasionally folds away. This tab used to open on seven screens of
        controls, every one of them at the same visual weight.
      */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide">
            {selectedScene === null ? "Aucune scène choisie" : sceneName(selectedScene)}
          </p>
          <p className="text-[11px] text-muted-foreground">Touchez une scène sur la timeline</p>
        </div>

        {stockConfigured ? (
          <>
            <Button className="mt-3 w-full" variant="gradient" onClick={autoFill} loading={autoFilling} disabled={!scenes.length}>
              <Sparkles /> Remplir toutes les scènes
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
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Clé <code>PEXELS_API_KEY</code> manquante — la recherche automatique de visuels est désactivée. Vous pouvez toujours importer vos propres fichiers.
          </p>
        )}
      </div>

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

      {pool.length > 0 && (
        <Section title="Bibliothèque du projet" icon={LibraryBig} count={pool.length}>
          <p className="text-[11px] text-muted-foreground">Touchez pour placer sur la scène choisie.</p>
          <ul className="mt-2 grid grid-cols-4 gap-2">
            {pool.map((item) => {
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
                  </button>
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

      <Section title="Calques" icon={Layers} count={layers.length}>
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
}: {
  layer: VisualLayer;
  sceneCount: number;
  sceneName: (i: number) => string;
  onMove: (target: number) => void;
  onUpdate: (patch: Partial<VisualLayer>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div className="flex items-center gap-2">
        <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-white/5">
          {layer.type === "video" ? <video src={layer.src} muted className="h-full w-full object-cover" /> : layer.src ? <img src={layer.src} alt="" className="h-full w-full object-cover" /> : null}
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
    </li>
  );
}
