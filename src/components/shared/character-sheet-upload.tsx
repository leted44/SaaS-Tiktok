"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAsset } from "@/lib/assets/upload-client";

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

/**
 * Pick, preview and clear a character sheet ("Image de référence").
 * `onChange` receives the stored image's URL, or null when cleared; saving it
 * is the caller's job.
 */
export function CharacterSheetUpload({ value, onChange, disabled, removable = true, removeLabel = "Retirer", pickLabel }: { value: string | null; onChange: (url: string | null) => void | Promise<void>; disabled?: boolean; removable?: boolean; removeLabel?: string; pickLabel?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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
        {value && removable && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => onChange(null)} className="text-red-300 hover:text-red-200">
            <Trash2 /> {removeLabel}
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
