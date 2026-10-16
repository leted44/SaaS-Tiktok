"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CharacterSheetUpload, type SheetGeneration } from "@/components/shared/character-sheet-upload";
import { setProjectCharacterImagesAction } from "@/server/actions/projects";

export interface CharacterReferenceState {
  /** This project's own images, when they replace its space's. Empty: the space's apply. */
  own: string[];
  /** Its space's images, used when the project has none of its own. */
  space: string[];
  spaceName: string | null;
  /** Its space, for the link to that space's settings. */
  spaceId: string | null;
}

/**
 * The character images a project's AI images are drawn with — the same block
 * in the video studio and the carousel editor. The space's apply by default;
 * adding or removing one here gives the project its own list (starting from
 * the space's), and « Reprendre celles de l'espace » goes back.
 */
export function CharacterReference({ projectId, initial, generate }: { projectId: string; initial: CharacterReferenceState; generate?: SheetGeneration }) {
  const [own, setOwn] = useState(initial.own);
  const [saving, setSaving] = useState(false);
  const shown = own.length ? own : initial.space;
  const plural = initial.space.length > 1 ? "celles" : "celle";

  async function save(urls: string[]) {
    setSaving(true);
    const res = await setProjectCharacterImagesAction(projectId, urls);
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    setOwn(urls);
    toast.success(urls.length ? "Images de référence enregistrées pour ce projet." : initial.space.length ? "Ce projet reprend les images de l'espace." : "Images de référence retirées.");
  }

  return (
    <div className="space-y-1.5">
      <Label>Images de référence <span className="font-normal normal-case text-muted-foreground">· les personnages récurrents, jusqu&apos;à 4</span></Label>
      <CharacterSheetUpload
        value={shown}
        onChange={save}
        disabled={saving}
        generate={generate}
        footer={
          own.length > 0 && initial.space.length > 0 ? (
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => save([])}>
              <RotateCcw /> Reprendre {plural} de l&apos;espace
            </Button>
          ) : null
        }
      />
      <p className="text-[11px] text-muted-foreground">
        {own.length
          ? "Propres à ce projet."
          : initial.space.length
            ? `Celles de l'espace « ${initial.spaceName ?? ""} », partagées par toutes ses vidéos et tous ses carrousels. Ajouter ou retirer une image ici ne change que ce projet.`
            : "Aucune : les personnages suivent seulement le Fil conducteur. Une image par personnage, seul sur fond blanc, les garde identiques d'une publication à l'autre — idéalement dans les réglages de l'espace."}{" "}
        L&apos;IA reçoit toutes ces images à chaque image générée, et le script les connaît toutes ; elles s&apos;appliquent aux prochaines images.
        {initial.spaceId && (
          <>
            {" "}
            <Link href={`/spaces?modifier=${initial.spaceId}`} className="font-medium text-foreground underline underline-offset-2">Réglages de l&apos;espace</Link>
          </>
        )}
      </p>
    </div>
  );
}
