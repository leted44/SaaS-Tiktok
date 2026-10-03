"use client";

import { useEffect, useState } from "react";
import { asImageModelChoice, DEFAULT_IMAGE_MODEL, type ImageModelChoice } from "@/lib/ai/image-models";
import { cn } from "@/lib/utils";

/** Prices per image at 1K, Google's own API. */
const CHOICES: { id: ImageModelChoice; label: string; price: string }[] = [
  { id: "flash", label: "Nano Banana 2", price: "0,067 $ / image · clients" },
  { id: "pro", label: "Pro", price: "0,134 $ / image" },
  { id: "mix", label: "Mélange", price: "Pro la 1re image, NB2 le reste" },
];

const KEY = "vs-image-model";

/**
 * The admin's image model choice, remembered on this device and shared by
 * the carousel and the video studio, so a comparison survives a reload and
 * a switch of format. Clients are always on DEFAULT_IMAGE_MODEL.
 */
export function useAdminImageModel(admin: boolean): [ImageModelChoice, (choice: ImageModelChoice) => void] {
  const [model, setModel] = useState<ImageModelChoice>(DEFAULT_IMAGE_MODEL);
  useEffect(() => {
    if (!admin) return;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setModel(asImageModelChoice(saved));
    } catch {
      // Storage unavailable: the test simply starts on the clients' model.
    }
  }, [admin]);
  function choose(choice: ImageModelChoice) {
    setModel(choice);
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // Not remembered, still applied for this session.
    }
  }
  return [model, choose];
}

/** The admin test box: the three models and what each costs. */
export function ImageModelPicker({ value, onChange, note, children }: { value: ImageModelChoice; onChange: (choice: ImageModelChoice) => void; note: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-3">
      <p className="text-xs font-semibold text-amber-200">Test admin · modèle d'image</p>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Modèle d'image">
        {CHOICES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={value === m.id}
            onClick={() => onChange(m.id)}
            className={cn("rounded-lg border p-2 text-left transition", value === m.id ? "border-amber-300/70 bg-amber-300/10" : "border-white/10 hover:border-white/20")}
          >
            <p className="text-xs font-semibold">{m.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{m.price}</p>
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-amber-100/80">{note}</p>
      {children}
    </div>
  );
}
