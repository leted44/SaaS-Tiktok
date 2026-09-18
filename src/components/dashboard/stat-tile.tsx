import type { LucideIcon } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export function StatTile({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: number; hint?: string }) {
  return (
    <div className="surface group relative overflow-hidden p-5 transition-colors hover:border-white/10">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-brand-300" />
      </div>
      <p className="mt-3 font-display text-3xl font-bold tabular-nums">{formatNumber(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
