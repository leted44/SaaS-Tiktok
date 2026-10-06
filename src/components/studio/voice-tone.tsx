"use client";

import { cn } from "@/lib/utils";

/**
 * How lively the voice reads — the one setting the expressive model (Eleven
 * v3, the only one offered) takes. It only knows three stability points, so a
 * 0-100 % slider promised a precision that did not exist: three named choices
 * say what each one actually sounds like.
 */
const TONES = [
  { value: 0, label: "Vivante", hint: "Plus d'émotion, parfois surprenante" },
  { value: 0.5, label: "Naturelle", hint: "Recommandée" },
  { value: 1, label: "Posée", hint: "Régulière, sans surprise" },
] as const;

/** The choice a stored stability falls on (the same thresholds the voice model applies). */
function toneOf(stability: number): number {
  if (stability < 0.34) return 0;
  return stability < 0.67 ? 0.5 : 1;
}

export function VoiceTonePicker({ value, onChange }: { value: number; onChange: (stability: number) => void }) {
  const current = toneOf(value);
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Ton de la voix">
      {TONES.map((t) => (
        <button
          key={t.label}
          type="button"
          role="radio"
          aria-checked={current === t.value}
          onClick={() => onChange(t.value)}
          className={cn("rounded-lg border p-2 text-left transition", current === t.value ? "border-brand-400/60 bg-brand-500/10" : "border-white/10 hover:border-white/20")}
        >
          <p className="text-xs font-semibold">{t.label}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{t.hint}</p>
        </button>
      ))}
    </div>
  );
}
