import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false, href = "/" }: { className?: string; compact?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient shadow-glow-sm transition-transform group-hover:scale-105">
        <Clapperboard className="h-4 w-4 text-white" />
      </span>
      {!compact && <span className="font-display text-lg font-bold tracking-tight">ClipForge</span>}
    </Link>
  );
}
