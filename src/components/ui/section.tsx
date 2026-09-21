"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  icon?: LucideIcon;
  /** What the section currently holds, shown in the header — so a closed section still says something. */
  summary?: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A collapsible block of the editor.
 *
 * On a phone the panels were one long, flat scroll with every control expanded
 * at equal weight — several screens deep before reaching anything. Folding the
 * secondary ones away leaves a screen of headers, each saying what it holds, so
 * the tab opens on its primary action rather than on everything at once.
 */
export function Section({ title, icon: Icon, summary, count, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-3 text-left transition hover:bg-white/[0.02]"
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-brand-300" />}
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        {typeof count === "number" && (
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>
        )}
        {summary !== undefined && !open && (
          <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground">{summary}</span>
        )}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", summary === undefined && !count && "ml-auto", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-white/[0.06] p-3">{children}</div>}
    </div>
  );
}
