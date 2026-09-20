"use client";

import { useState } from "react";
import { Check, Copy, Hash, Music2, Instagram } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { SocialCopy } from "@/lib/social/captions";
import { cn } from "@/lib/utils";

const PLATFORMS = [
  { key: "tiktok", label: "TikTok", icon: Music2 },
  { key: "instagram", label: "Instagram", icon: Instagram },
] as const;

export function SocialCopyBlock({ copy, hashtags }: { copy: SocialCopy; hashtags: string[] }) {
  const [platform, setPlatform] = useState<"tiktok" | "instagram">("tiktok");
  const [copied, setCopied] = useState<string | null>(null);
  const text = copy[platform];

  async function write(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      toast.error("Copie impossible — sélectionnez le texte manuellement.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Description du post</Label>
        <div className="flex gap-1">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPlatform(p.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition",
                platform === p.key ? "border-primary/60 bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              <p.icon className="h-3 w-3" /> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="surface p-3">
        <p className="max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{text}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => write(text, "text")}>
            {copied === "text" ? <Check className="text-emerald-400" /> : <Copy />} {copied === "text" ? "Copié" : "Copier la description"}
          </Button>
          <Button size="sm" variant="ghost" disabled={!hashtags.length} onClick={() => write(hashtags.map((h) => `#${h}`).join(" "), "tags")}>
            {copied === "tags" ? <Check className="text-emerald-400" /> : <Hash />} {copied === "tags" ? "Copié" : "Copier les hashtags"}
          </Button>
        </div>
      </div>
    </div>
  );
}
