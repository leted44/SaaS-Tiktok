import { cn } from "@/lib/utils";

/** The script's virality as a gradient ring. */
export function ViralityRing({ value, size = 96, id }: { value: number; size?: number; id: string }) {
  const stroke = size >= 80 ? 8 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gid = `vr-${id}`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="55%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#fb923c" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${gid})`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * Math.max(0, Math.min(100, value))) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold leading-none tabular-nums" style={{ fontSize: size * 0.3 }}>{value}</span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Viralité</span>
      </div>
    </div>
  );
}

export function ScoreBars({ scores, className }: { scores: { hook: number; retention: number; clarity: number }; className?: string }) {
  const rows: [string, number][] = [
    ["Hook", scores.hook],
    ["Rétention", scores.retention],
    ["Clarté", scores.clarity],
  ];
  return (
    <dl className={cn("space-y-2.5", className)}>
      {rows.map(([label, v]) => (
        <div key={label}>
          <div className="flex items-baseline justify-between text-xs">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{v}<span className="text-muted-foreground/60">/100</span></dd>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-violet-400/80" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
          </div>
        </div>
      ))}
    </dl>
  );
}
