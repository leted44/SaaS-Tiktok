import { cn } from "@/lib/utils";

export function ScoreRing({ value, size = 64, label, className }: { value: number; size?: number; label?: string; className?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? "#34D399" : value >= 60 ? "#FBBF24" : "#F87171";
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} className="transition-[stroke-dashoffset] duration-700 ease-out" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display font-bold" style={{ fontSize: size * 0.3 }}>{value}</span>
      </div>
      {label && <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>}
    </div>
  );
}
