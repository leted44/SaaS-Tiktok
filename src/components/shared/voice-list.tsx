"use client";

import { useMemo } from "react";
import { Check, Loader2, Lock, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { languageLabel } from "@/lib/tts/voices";
import type { useVoicePreview } from "@/lib/tts/use-voice-preview";
import { cn } from "@/lib/utils";

export interface VoiceOption {
  id: string;
  name: string;
  style: string;
  gender: string;
  language: string;
  premium: boolean;
}

/** The voices by language, each with a listen button — the autopilot template's and the space look's. */
export function VoiceList({ voices, value, onChange, premiumAllowed, preview }: { voices: VoiceOption[]; value: string | null; onChange: (id: string) => void; premiumAllowed: boolean; preview: ReturnType<typeof useVoicePreview> }) {
  const voiceGroups = useMemo(() => {
    const groups: { language: string; items: VoiceOption[] }[] = [];
    for (const v of voices) {
      const g = groups.find((x) => x.language === v.language);
      if (g) g.items.push(v);
      else groups.push({ language: v.language, items: [v] });
    }
    return groups;
  }, [voices]);

  return (
    <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
      {voiceGroups.map((g) => (
        <div key={g.language}>
          <p className="mb-1 mt-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{languageLabel(g.language)}<span className="h-px flex-1 bg-white/[0.06]" /></p>
          <div className="space-y-1.5">
            {g.items.map((v) => {
              const locked = v.premium && !premiumAllowed;
              const selected = value === v.id;
              return (
                <div key={v.id} className={cn("flex items-center gap-2 rounded-lg border p-2 transition", selected ? "border-primary/60 bg-primary/10" : "border-white/10 hover:border-white/20")}>
                  <button type="button" disabled={locked} onClick={() => onChange(v.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white", v.gender === "female" ? "bg-gradient-to-br from-pink-500 to-purple-600" : "bg-gradient-to-br from-indigo-500 to-cyan-500")}>{v.name[0]}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{v.name} {locked && <Lock className="inline h-3 w-3" />}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{v.style}</span>
                    </span>
                    {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-brand-300" />}
                  </button>
                  <Button size="icon-sm" variant={preview.playing === v.id ? "default" : "ghost"} aria-label={`Écouter ${v.name}`} disabled={preview.loadingId === v.id} onClick={() => preview.toggle(v.id)}>
                    {preview.loadingId === v.id ? <Loader2 className="animate-spin" /> : preview.playing === v.id ? <Pause /> : <Play />}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
