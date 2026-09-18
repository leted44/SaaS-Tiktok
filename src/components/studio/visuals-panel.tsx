"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Image as ImageIcon, Film, Trash2, Layers, Palette, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { VisualLayer, BackgroundStyle } from "@/lib/validations";
import type { ShortVideoProps } from "@/lib/render/props";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

interface Asset { id: string; type: string; url: string; name: string; mimeType: string }

interface Props {
  layers: VisualLayer[];
  background: BackgroundStyle;
  scenes: ShortVideoProps["scenes"];
  selectedScene: number | null;
  onLayersChange: (l: VisualLayer[]) => void;
  onBackgroundChange: (b: BackgroundStyle) => void;
}

export function VisualsPanel({ layers, background, scenes, selectedScene, onLayersChange, onBackgroundChange }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/assets/upload").then((r) => r.json()).then((j) => setAssets((j.assets ?? []).filter((a: Asset) => a.type === "IMAGE" || a.type === "VIDEO"))).catch(() => undefined);
  }, []);

  async function upload(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      if (!res.ok) { toast.error(`${file.name}: ${(await res.json()).error ?? "échec de l'envoi"}`); continue; }
      const { asset } = await res.json();
      setAssets((a) => [asset, ...a]);
      addLayer(asset);
    }
    setUploading(false);
  }

  function addLayer(asset: Asset) {
    const sceneIdx = selectedScene ?? 0;
    const scene = scenes[sceneIdx] ?? scenes[0];
    if (!scene) return toast.error("Générez d'abord un script pour que les scènes existent.");
    const layer: VisualLayer = { id: nanoid(8), type: asset.type === "VIDEO" ? "video" : "image", src: asset.url, startMs: scene.startMs, endMs: scene.endMs, fit: "cover", kenBurns: "in", opacity: 1, sceneIndex: sceneIdx };
    onLayersChange([...layers.filter((l) => l.sceneIndex !== sceneIdx), layer]);
    toast.success(`B-roll ajouté ${sceneIdx === 0 ? "au hook" : sceneIdx === scenes.length - 1 ? "au CTA" : `à la scène ${sceneIdx}`}`);
  }

  const update = (id: string, patch: Partial<VisualLayer>) => onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onLayersChange(layers.filter((l) => l.id !== id));

  return (
    <div className="space-y-6">
      <div>
        <Label>Fond</Label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([["gradient", "Dégradé"], ["solid", "Uni"], ["grain", "Grain"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => onBackgroundChange({ ...background, type: t })} className={cn("rounded-lg border px-2 py-1.5 text-xs transition", background.type === t ? "border-primary/60 bg-primary/10" : "border-white/10")}>{label}</button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {background.colors.map((c, i) => (
            <input key={i} type="color" value={c} onChange={(e) => onBackgroundChange({ ...background, colors: background.colors.map((x, k) => (k === i ? e.target.value : x)) })} className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5" />
          ))}
          {background.colors.length < 3 && <Button size="sm" variant="ghost" onClick={() => onBackgroundChange({ ...background, colors: [...background.colors, "#DB2777"] })}><Palette /> Ajouter</Button>}
          {background.colors.length > 1 && <Button size="sm" variant="ghost" onClick={() => onBackgroundChange({ ...background, colors: background.colors.slice(0, -1) })}>Retirer</Button>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm"><span>Vignettage</span><Switch checked={background.vignette} onCheckedChange={(v) => onBackgroundChange({ ...background, vignette: v })} /></label>
          <label className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm"><span>Grain de film</span><Switch checked={background.grain} onCheckedChange={(v) => onBackgroundChange({ ...background, grain: v })} /></label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between"><Label>B-roll pour {selectedScene === null ? "la scène sélectionnée" : selectedScene === 0 ? "le hook" : selectedScene === scenes.length - 1 ? "le CTA" : `la scène ${selectedScene}`}</Label><span className="text-[11px] text-muted-foreground">Cliquez une scène sur la timeline</span></div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={cn("mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition", dragOver ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/20")}
        >
          <input ref={fileRef} type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-brand-300" /> : <Upload className="h-6 w-6 text-brand-300" />}
          <p className="mt-2 text-sm font-medium">Déposez des images ou clips</p>
          <p className="text-xs text-muted-foreground">PNG, JPG, WebP, MP4 · jusqu'à 50 Mo</p>
        </div>
        {assets.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {assets.slice(0, 16).map((a) => (
              <button key={a.id} onClick={() => addLayer(a)} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/5" title={a.name}>
                {a.type === "VIDEO" ? <video src={a.url} muted className="h-full w-full object-cover" /> : <img src={a.url} alt="" className="h-full w-full object-cover" />}
                <span className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-white">{a.type === "VIDEO" ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> Calques ({layers.length})</Label>
        {layers.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Aucun calque visuel. Le fond animé s'affiche derrière les sous-titres.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {[...layers].sort((a, b) => a.startMs - b.startMs).map((l) => (
              <li key={l.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-white/5">{l.type === "video" ? <video src={l.src} muted className="h-full w-full object-cover" /> : l.src ? <img src={l.src} alt="" className="h-full w-full object-cover" /> : null}</div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-xs font-medium">{l.sceneIndex === 0 ? "Hook" : l.sceneIndex === scenes.length - 1 ? "CTA" : `Scène ${l.sceneIndex}`} · {(l.startMs / 1000).toFixed(1)}–{(l.endMs / 1000).toFixed(1)}s</p>
                  <div className="flex gap-1">
                    <Select value={l.kenBurns} onValueChange={(v) => update(l.id, { kenBurns: v as VisualLayer["kenBurns"] })}>
                      <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="in">Zoom avant</SelectItem><SelectItem value="out">Zoom arrière</SelectItem><SelectItem value="pan-left">Panoramique gauche</SelectItem><SelectItem value="pan-right">Panoramique droite</SelectItem><SelectItem value="none">Statique</SelectItem></SelectContent>
                    </Select>
                    <Select value={l.fit} onValueChange={(v) => update(l.id, { fit: v as VisualLayer["fit"] })}>
                      <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="cover">Remplir</SelectItem><SelectItem value="contain">Ajuster</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost" className="text-red-300" onClick={() => remove(l.id)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
