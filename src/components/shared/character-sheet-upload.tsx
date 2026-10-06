"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAsset } from "@/lib/assets/upload-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StylePicker } from "@/components/shared/style-picker";
import { editCharacterSheetAction, generateCharacterSheetsAction } from "@/server/actions/characters";
import type { VisualStyle } from "@/lib/carousel/art-direction";
import { cn } from "@/lib/utils";

/** Long side of the stored sheet: enough for the image model to read every detail, small enough to send with every image. */
const MAX_SIDE = 1600;

/**
 * Re-encode the picked file as a JPEG, at most MAX_SIDE wide or tall.
 *
 * The image pipeline reads JPEG and PNG only, and a phone hands over whatever
 * it has — WebP from a browser download, HEIC from an iPhone gallery. Drawing
 * it on a canvas lets the phone's own decoder do the conversion.
 */
async function toJpeg(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Ce fichier n'est pas une image lisible."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Conversion de l'image impossible sur cet appareil.");
    // A transparent PNG would turn black in a JPEG: paint the sheet's background white first.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("Conversion de l'image impossible sur cet appareil.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "personnages"}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SheetGeneration {
  /** What the description field starts with: the space's Thématique, or the project's Fil conducteur. */
  description: string;
  /** Credits per image — zero for accounts that aren't charged. */
  cost: number;
  enabled: boolean;
}

/**
 * Pick, preview and clear a character sheet ("Image de référence") — imported,
 * or drawn here when `generate` is given. `onChange` receives the stored
 * image's URL, or null when cleared; saving it is the caller's job.
 */
export function CharacterSheetUpload({ value, onChange, disabled, removable = true, removeLabel = "Retirer", pickLabel, generate }: { value: string | null; onChange: (url: string | null) => void | Promise<void>; disabled?: boolean; removable?: boolean; removeLabel?: string; pickLabel?: string; generate?: SheetGeneration }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await uploadAsset(await toJpeg(file), { kind: "asset" });
      await onChange(asset.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "L'envoi de l'image a échoué.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled || busy}
          className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/15 bg-white/[0.03] transition hover:border-white/30"
          aria-label="Choisir l'image de référence"
        >
          {value ? <img src={value} alt="Image de référence des personnages" className="h-full w-full bg-white object-contain" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
        </button>
        <div className="flex flex-col gap-1.5">
          <Button type="button" size="sm" variant="secondary" loading={busy} disabled={disabled} onClick={() => input.current?.click()}>
            <ImagePlus /> {pickLabel ?? (value ? "Remplacer" : "Choisir une image")}
          </Button>
          {generate?.enabled && (
            <Button type="button" size="sm" variant="secondary" disabled={disabled || busy} onClick={() => setGenerating((g) => !g)}>
              <Wand2 /> Générer avec l&apos;IA
            </Button>
          )}
          {value && removable && (
            <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => onChange(null)} className="text-red-300 hover:text-red-200">
              <Trash2 /> {removeLabel}
            </Button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {generating && generate && (
        <SheetGenerator
          generation={generate}
          onUse={async (url) => {
            await onChange(url);
            setGenerating(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Describe the characters, get two sheets, pick one, touch it up in plain
 * words, use it. The rules of a usable sheet (white background, full body,
 * front view) are the server's job — see server/actions/characters.
 */
function SheetGenerator({ generation, onUse }: { generation: SheetGeneration; onUse: (url: string) => Promise<void> }) {
  const [description, setDescription] = useState(generation.description);
  const [style, setStyle] = useState<VisualStyle>("illustration");
  const [proposals, setProposals] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState<"generate" | "edit" | "use" | null>(null);
  const credits = (n: number) => (generation.cost > 0 ? `${n * generation.cost} crédit${n * generation.cost > 1 ? "s" : ""}` : "Gratuit sur ce compte");

  async function draw() {
    setLoading("generate");
    const res = await generateCharacterSheetsAction({ description, style });
    setLoading(null);
    if (!res.ok) return void toast.error(res.error);
    setProposals(res.data.urls);
    setSelected(res.data.urls[0] ?? null);
  }

  async function touchUp() {
    if (!selected) return;
    setLoading("edit");
    const res = await editCharacterSheetAction({ url: selected, instruction });
    setLoading(null);
    if (!res.ok) return void toast.error(res.error);
    setProposals((p) => [res.data.url, ...p]);
    setSelected(res.data.url);
    setInstruction("");
  }

  async function use() {
    if (!selected) return;
    setLoading("use");
    await onUse(selected);
    setLoading(null);
  }

  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="space-y-1.5">
        <Label>Décris tes personnages</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={1200}
          placeholder="Ex. : Globi, un globule rouge en forme de disque avec des gants blancs et de longues jambes noires ; l'estomac, rose et rond ; le cerveau, rose pâle et plissé."
        />
        <p className="text-[11px] text-muted-foreground">Forme, couleurs, accessoires de chacun. Le fond blanc et la pose de face sont ajoutés automatiquement.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Style</Label>
        <StylePicker value={style} onChange={setStyle} />
      </div>
      <Button type="button" size="sm" variant="gradient" className="w-full" loading={loading === "generate"} disabled={loading !== null || description.trim().length < 10} onClick={draw}>
        <Wand2 /> {proposals.length ? "Regénérer" : "Générer 2 propositions"}
      </Button>
      <p className="-mt-1.5 text-center text-[11px] text-muted-foreground">{credits(2)}</p>

      {proposals.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {proposals.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => setSelected(url)}
                className={cn("relative overflow-hidden rounded-lg border-2 bg-white transition", selected === url ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}
              >
                <img src={url} alt="Proposition de fiche personnages" className="aspect-video w-full object-contain" />
                {selected === url && <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary p-0.5 text-white" />}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Retoucher la fiche choisie</Label>
            <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={500} placeholder="Ex. : ajoute une petite bouche au cerveau" />
            <Button type="button" size="sm" variant="secondary" className="w-full" loading={loading === "edit"} disabled={loading !== null || !selected || instruction.trim().length < 3} onClick={touchUp}>
              Retoucher · {credits(1)}
            </Button>
          </div>
          <Button type="button" size="sm" variant="gradient" className="w-full" loading={loading === "use"} disabled={loading !== null || !selected} onClick={use}>
            <Check /> Utiliser cette fiche
          </Button>
        </>
      )}
    </div>
  );
}
