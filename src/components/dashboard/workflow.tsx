import { Check, Captions, Film, FileText, Layers, Mic2 } from "lucide-react";
import type { StepKey, WorkflowStep } from "@/app/(app)/dashboard/data";
import { cn } from "@/lib/utils";

const ICONS: Record<StepKey, typeof FileText> = { script: FileText, voice: Mic2, visuals: Layers, captions: Captions, export: Film };

/** Script → Voix → Visuels → Sous-titres → Export, as far as this project has got. */
export function Workflow({ steps, compact = false }: { steps: WorkflowStep[]; compact?: boolean }) {
  return (
    <ol className="grid grid-cols-5" aria-label="Avancement du projet">
      {steps.map((s, i) => {
        const Icon = ICONS[s.key];
        const doneBefore = i > 0 && steps[i - 1].state === "done";
        return (
          <li key={s.key} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span aria-hidden className={cn("absolute right-1/2 top-[15px] h-px w-full", doneBefore && s.state !== "todo" ? "bg-gradient-to-r from-fuchsia-400/70 to-violet-400/70" : "bg-white/10", compact && "top-[11px]")} />
            )}
            <span
              className={cn(
                "relative z-10 flex items-center justify-center rounded-full border transition",
                compact ? "h-6 w-6" : "h-8 w-8",
                s.state === "done" && "border-transparent bg-brand-gradient text-white shadow-[0_0_18px_-4px_rgba(219,39,119,0.8)]",
                s.state === "active" && "border-violet-400/70 bg-violet-500/15 text-violet-200 shadow-[0_0_0_4px_rgba(139,92,246,0.12)]",
                s.state === "todo" && "border-white/10 bg-white/[0.03] text-muted-foreground/60",
              )}
            >
              {s.state === "active" && <span aria-hidden className="absolute inset-0 rounded-full border border-violet-400/60 motion-safe:animate-pulse-ring" />}
              {s.state === "done" ? <Check className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={3} /> : <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />}
            </span>
            <span className={cn("mt-1.5 font-medium", compact ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-xs", s.state === "todo" ? "text-muted-foreground/70" : "text-foreground")}>{s.label}</span>
            {!compact && <span className={cn("hidden text-[10px] sm:block", s.state === "active" ? "text-violet-200" : "text-muted-foreground")}>{s.detail}</span>}
            <span className="sr-only">{s.state === "done" ? "fait" : s.state === "active" ? "prochaine étape" : "à venir"} — {s.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The same progress as five thin segments, for small cards. */
export function WorkflowBar({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {steps.map((s) => (
        <span key={s.key} className={cn("h-1 flex-1 rounded-full", s.state === "done" ? "bg-gradient-to-r from-fuchsia-400 to-orange-300" : s.state === "active" ? "bg-white/40" : "bg-white/15")} />
      ))}
    </div>
  );
}
