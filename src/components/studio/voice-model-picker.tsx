"use client";

import { useEffect, useState } from "react";
import type { VoiceModel } from "@/lib/tts/elevenlabs";
import { cn } from "@/lib/utils";

const CHOICES: { id: VoiceModel; label: string; hint: string }[] = [
  { id: "standard", label: "Standard", hint: "Multilingual v2 · stable, tous réglages" },
  { id: "expressive", label: "Expressif", hint: "Eleven v3 · le plus naturel" },
];

const KEY = "vs-voice-model";

/** The admin's voice model choice, remembered on this device so a comparison survives a reload. Anyone else is always on the standard model. */
export function useAdminVoiceModel(admin: boolean): [VoiceModel, (choice: VoiceModel) => void] {
  const [model, setModel] = useState<VoiceModel>("standard");
  useEffect(() => {
    if (!admin) return;
    try {
      if (localStorage.getItem(KEY) === "expressive") setModel("expressive");
    } catch {
      // Storage unavailable: the test simply starts on the standard model.
    }
  }, [admin]);
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

/** The admin test box: generate the same script with each model and compare by ear. */
export function VoiceModelPicker({ value, onChange }: { value: VoiceModel; onChange: (choice: VoiceModel) => void }) {
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-3">
      <p className="text-xs font-semibold text-amber-200">Test admin · modèle de voix</p>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Modèle de voix">
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
            <p className="mt-0.5 text-[10px] text-muted-foreground">{m.hint}</p>
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-amber-100/80">Visible par toi seul ; tes clients restent sur Standard. Génère la même voix off avec chaque modèle et compare à l'écoute.</p>
    </div>
  );
}
