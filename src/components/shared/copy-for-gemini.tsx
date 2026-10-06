"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Clipboard API first; the hidden-textarea copy for browsers that refuse it (older phones, non-secure frames). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * Copies an image's full prompt (lib/ai/gemini-prompt) to paste in the Gemini
 * app — free there — before importing the result onto the scene or slide.
 */
export function CopyForGemini({ prompt, cast, className }: { prompt: string; cast: boolean; className?: string }) {
  async function copy() {
    if (!(await copyText(prompt))) return void toast.error("Copie impossible sur ce navigateur.");
    toast.success("Copié — colle-le dans Gemini", {
      description: cast ? "Joins aussi ta fiche personnages (Image de référence) à la demande." : "Puis importe l'image obtenue ici.",
      action: { label: "Ouvrir Gemini", onClick: () => window.open("https://gemini.google.com/app", "_blank", "noopener") },
    });
  }
  return (
    <Button type="button" size="sm" variant="outline" className={cn("h-auto min-h-7 gap-1 whitespace-normal px-1.5 py-1 text-[11px] leading-tight", className)} onClick={copy}>
      <Copy className="h-3 w-3 shrink-0" /> Copier pour Gemini
    </Button>
  );
}
