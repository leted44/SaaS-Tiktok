"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { CharacterSheetUpload, type SheetGeneration } from "@/components/shared/character-sheet-upload";
import { setProjectCharacterImageAction } from "@/server/actions/projects";

export interface CharacterReferenceState {
  /** This project's own sheet, when it replaces its space's. */
  own: string | null;
  /** Its space's sheet, used when the project has none of its own. */
  space: string | null;
  spaceName: string | null;
  /** Its space, for the link to that space's settings. */
  spaceId: string | null;
}

/**
 * The character sheet a project's AI images are drawn with — the same block
 * in the video studio and the carousel editor. The space's sheet applies by
 * default; a project can swap in its own, and go back to the space's.
 */
export function CharacterReference({ projectId, initial, generate }: { projectId: string; initial: CharacterReferenceState; generate?: SheetGeneration }) {
  const [own, setOwn] = useState(initial.own);
  const [saving, setSaving] = useState(false);
  const shown = own ?? initial.space;

  async function save(url: string | null) {
    setSaving(true);
    const res = await setProjectCharacterImageAction(projectId, url);
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    setOwn(url);
    toast.success(url ? "Image de référence enregistrée pour ce projet." : initial.space ? "Ce projet reprend l'image de l'espace." : "Image de référence retirée.");
  }

  return (
    <div className="space-y-1.5">
      <Label>Image de référence <span className="font-normal normal-case text-muted-foreground">· les personnages récurrents</span></Label>
      <CharacterSheetUpload
        value={shown}
        onChange={save}
        disabled={saving}
        removable={own !== null}
        removeLabel={initial.space ? "Reprendre celle de l'espace" : "Retirer"}
        pickLabel={own ? "Remplacer" : shown ? "Remplacer pour ce projet" : "Choisir une image"}
        generate={generate}
      />
      <p className="text-[11px] text-muted-foreground">
        {own
          ? "Propre à ce projet."
          : initial.space
            ? `Celle de l'espace « ${initial.spaceName ?? ""} », partagée par toutes ses vidéos et tous ses carrousels.`
            : "Aucune : les personnages suivent seulement le Fil conducteur. Une image des personnages seuls, sur fond blanc, les garde identiques d'une publication à l'autre — idéalement dans les réglages de l'espace."}{" "}
        Elle s'applique aux prochaines images générées.
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
