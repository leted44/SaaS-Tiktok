"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Hash, Music2, Instagram, RefreshCw, Coins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { regenerateSocialCopyAction } from "@/server/actions/scripts";
import { formatForPaste, platformHashtags, type Platform, type SocialCopy } from "@/lib/social/captions";
import { cn } from "@/lib/utils";

const PLATFORMS = [
  { key: "tiktok", label: "TikTok", icon: Music2 },
  { key: "instagram", label: "Instagram", icon: Instagram },
] as const;

interface Props {
  scriptId: string;
  copy: SocialCopy;
  hashtags: string[];
  cost: number;
  aiConfigured: boolean;
}

export function SocialCopyBlock({ scriptId, copy, hashtags, cost, aiConfigured }: Props) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [copied, setCopied] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const caption = copy[platform];
  const tags = platformHashtags(copy, platform, hashtags);
  const label = PLATFORMS.find((p) => p.key === platform)!.label;

  async function write(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      toast.error("Copie impossible — sélectionnez le texte manuellement.");
    }
  }

  async function regenerate() {
    setRegenerating(true);
    const res = await regenerateSocialCopyAction(scriptId);
    setRegenerating(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Nouvelle description générée${cost > 0 ? ` · ${cost} crédit` : ""}`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {/* The title lives on the enclosing section header, so this row only has to pick the platform. */}
      <div className="flex items-center justify-end">
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
        <p className="max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{caption}</p>
        {tags.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1 border-t border-white/[0.06] pt-2 text-[11px] text-brand-300">
            {tags.map((t) => (
              <span key={t}>#{t.replace(/^#/, "")}</span>
            ))}
          </p>
        )}

        <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => write(formatForPaste(caption, tags), "all")}>
          {copied === "all" ? <Check className="text-emerald-400" /> : <Copy />} {copied === "all" ? "Copié" : `Copier pour ${label}`}
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" variant="ghost" disabled={!tags.length} onClick={() => write(tags.map((t) => `#${t.replace(/^#/, "")}`).join(" "), "tags")}>
            {copied === "tags" ? <Check className="text-emerald-400" /> : <Hash />} {copied === "tags" ? "Copié" : "Hashtags seuls"}
          </Button>
          <Button size="sm" variant="ghost" loading={regenerating} disabled={!aiConfigured} onClick={regenerate}>
            <RefreshCw /> Régénérer {cost > 0 && <><Coins className="h-3 w-3" /> {cost}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
