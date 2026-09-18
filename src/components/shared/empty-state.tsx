import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("surface flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="relative mb-4">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/20" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-brand-300">
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
