"use client";

import { useEffect, useState } from "react";
import type { VoiceModel } from "@/lib/tts/elevenlabs";
import { cn } from "@/lib/utils";

const CHOICES: { id: VoiceModel; label: string; hint: string }[] = [
  { id: "expressive", label: "Expressive", hint: "La plus naturelle · recommandée" },
  { id: "standard", label: "Standard", hint: "Plus posée · vitesse réglable" },
];

const KEY = "vs-voice-model";

/** The voice model choice, remembered on this device. Expressive (Eleven v3) unless the creator picked Standard. */
export function useVoiceModel(): [VoiceModel, (choice: VoiceModel) => void] {
  const [model, setModel] = useState<VoiceModel>("expressive");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "standard") setModel("standard");
    } catch {
      // Storage unavailable: stays on the default.
    }
  }, []);
  function choose(choice: VoiceModel) {
    setModel(choice);
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // Not remembered, still applied for this session.
    }
  }
  return [model, choose];
}

export function VoiceModelPicker({ value, onChange }: { value: VoiceModel; onChange: (choice: VoiceModel) => void }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Rendu de la voix">
      {CHOICES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={cn("rounded-lg border p-2 text-left transition", value === m.id ? "border-brand-400/60 bg-brand-500/10" : "border-white/10 hover:border-white/20")}
        >
          <p className="text-xs font-semibold">{m.label}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{m.hint}</p>
        </button>
      ))}
    </div>
  );
}
