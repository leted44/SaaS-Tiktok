"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime, truncate } from "@/lib/utils";

export interface ScriptSummary {
  id: string;
  title: string;
  hook: string;
  viralityScore: number;
  createdAt: string;
  projectId: string;
  projectTitle: string;
  version: number;
  durationSec: number;
}

export function ScriptLibrary({ scripts }: { scripts: ScriptSummary[] }) {
  const [q, setQ] = useState("");
  const filtered = scripts.filter((s) => `${s.title} ${s.hook} ${s.projectTitle}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="surface flex h-fit max-h-[calc(100vh-180px)] flex-col xl:sticky xl:top-24">
      <div className="border-b border-white/[0.05] p-4">
        <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-brand-300" /> Script library <span className="text-xs font-normal text-muted-foreground">({scripts.length})</span></p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scripts…" className="pl-9" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{scripts.length === 0 ? "Generated scripts appear here." : "No matches."}</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {filtered.map((s) => (
              <li key={s.id}>
                <Link href={`/studio/${s.projectId}`} className="block px-4 py-3 transition-colors hover:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-medium">{s.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.viralityScore >= 80 ? "bg-emerald-500/15 text-emerald-300" : s.viralityScore >= 60 ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300"}`}>{s.viralityScore}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">“{truncate(s.hook, 110)}”</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground/70">v{s.version} · {s.durationSec}s · {relativeTime(s.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
