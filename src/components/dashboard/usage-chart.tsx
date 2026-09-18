const LABELS: Record<string, { label: string; color: string }> = {
  SCRIPT_GENERATION: { label: "Scripts", color: "#A78BFA" },
  VOICEOVER: { label: "Voiceovers", color: "#F472B6" },
  RENDER: { label: "Renders", color: "#FBBF24" },
};

export function UsageChart({ usage }: { usage: Record<string, { credits: number; count: number }> }) {
  const rows = Object.entries(LABELS).map(([k, v]) => ({ ...v, credits: usage[k]?.credits ?? 0, count: usage[k]?.count ?? 0 }));
  const total = rows.reduce((a, r) => a + r.credits, 0) || 1;
  return (
    <div className="mt-4">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${(r.credits / total) * 100}%`, background: r.color }} className="h-full transition-all" />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label} <span className="opacity-60">×{r.count}</span></span>
            <span className="font-medium tabular-nums">{r.credits}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
