"use client";

import { useState } from "react";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "Rendu de l'espace" (lib/space-kit), in the video studio and the carousel
 * editor alike: save this post's look as its space's, so every new post of the
 * space starts with it, or bring the space's look onto this post.
 */
export function SpaceLookButton({ spaceName, kind, saved, onSave, onApply }: {
  spaceName: string;
  kind: "video" | "carousel";
  /** The space's look for this format, if one is saved: when, from which post, and what it holds. */
  saved: { savedAt: string; fromThis: boolean; summary: string[] } | null;
  onSave: () => Promise<boolean>;
  onApply: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Grammar follows the word: « une vidéo », « un carrousel ».
  const w = kind === "video" ? { each: "chaque nouvelle vidéo", these: "les nouvelles vidéos", this: "cette vidéo", other: "une autre vidéo" } : { each: "chaque nouveau carrousel", these: "les nouveaux carrousels", this: "ce carrousel", other: "un autre carrousel" };
  const holds =
    kind === "video"
      ? "les sous-titres, le fond, la musique, la voix et son ton, le style des images et la couverture"
      : "le modèle, le format, la couleur d'accent, la signature et le style des images";

  async function save() {
    setSaving(true);
    const ok = await onSave();
    setSaving(false);
    if (ok) setOpen(false);
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} title={`Le rendu de ${w.each} de l'espace ${spaceName}`}>
        <Palette /> <span className="sm:hidden">Rendu</span><span className="hidden sm:inline">Rendu de l&apos;espace</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rendu de l&apos;espace « {spaceName} »</DialogTitle>
            <DialogDescription>
              {w.each.charAt(0).toUpperCase() + w.each.slice(1)} de cet espace démarre avec ce rendu : {holds}. Le sujet, le texte et les images restent propres à chacun{kind === "video" ? "e" : ""}.
            </DialogDescription>
          </DialogHeader>

          {saved ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-muted-foreground">
                Enregistré le {new Date(saved.savedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                {saved.fromThis ? ` depuis ${w.this}` : ` depuis ${w.other}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {saved.summary.map((s) => (
                  <span key={s} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px]">{s}</span>
                ))}
              </div>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => { onApply(); setOpen(false); }}>
                <Check /> Appliquer ce rendu à {w.this}
              </Button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-muted-foreground">Aucun rendu enregistré pour l&apos;instant : {w.these} partent des réglages par défaut.</p>
          )}

          <Button variant="gradient" loading={saving} onClick={save} className="w-full">
            {!saving && <Palette />} {saved ? `Remplacer par le rendu de ${w.this}` : `Enregistrer le rendu de ${w.this}`}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
