import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UpgradePrompt({ title = "You're out of credits", body = "Upgrade your plan or buy a credit pack to keep creating.", compact = false }: { title?: string; body?: string; compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-primary/30 bg-primary/10 ${compact ? "p-4" : "p-6"}`}>
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-gradient opacity-30 blur-2xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
        <Button asChild variant="gradient" size={compact ? "sm" : "default"}>
          <Link href="/billing"><Zap /> View plans</Link>
        </Button>
      </div>
    </div>
  );
}
