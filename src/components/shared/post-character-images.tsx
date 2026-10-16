"use client";

import { CharacterSheetUpload } from "@/components/shared/character-sheet-upload";

/**
 * The character images of the post being created, in the creation forms
 * (dashboard, Générateur de script): the space's, shown to be changed for
 * this post only — like the Fil conducteur next to it. `value` is null while
 * the space's apply; postCharacterOverride() says what to send.
 */
export function PostCharacterImages({ spaceImages, value, onChange, spaced }: { spaceImages: string[]; value: string[] | null; onChange: (urls: string[] | null) => void; spaced: boolean }) {
  const shown = value ?? spaceImages;
  const override = postCharacterOverride(value, spaceImages);
  return (
    <div className="space-y-1.5">
      <CharacterSheetUpload value={shown} onChange={(urls) => onChange(urls)} />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {override
          ? `Ce post utilisera ${override.length > 1 ? "ces images" : "cette image"} pour ses personnages${spaceImages.length ? ", à la place de celles de l'espace" : ""} : le script les connaît et chaque image IA les reçoit.`
          : spaceImages.length
            ? "Celles de l'espace : rien à faire. Ajoute ou retire une image pour changer les personnages de ce post seulement."
            : spaced
              ? "Aucune dans cet espace. Ajoute une image par personnage pour que le script et les images les gardent identiques."
              : "Une image par personnage (jusqu'à 4) : le script les connaît et chaque image IA les reçoit."}
      </p>
    </div>
  );
}

/** The list to send with the script request: only when it differs from the space's and is not empty (empty = the space's). */
export function postCharacterOverride(value: string[] | null, spaceImages: string[]): string[] | undefined {
  return value && value.length && value.join("\n") !== spaceImages.join("\n") ? value : undefined;
}
