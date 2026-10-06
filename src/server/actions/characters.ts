"use server";

import { z } from "zod";
import { requireDbUser } from "@/lib/auth";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { editImage, generateImage, AiImageError } from "@/lib/ai/image-generator";
import { isOwnImage, readOwnImage, storeGeneratedImage } from "@/lib/ai/images";
import { ART_DIRECTIONS, VISUAL_STYLES } from "@/lib/carousel/art-direction";
import { guard, type ActionResult } from "@/server/action-result";

/**
 * A character sheet ("Image de référence") made in the app.
 *
 * What makes a sheet work is how it is drawn — characters alone, full body,
 * front view, large, on plain white — and a creator describing their mascot
 * rarely knows that. So the creator only describes the characters; the rules
 * of a usable sheet are written here, and the art direction of the account
 * sets the rendering. Two proposals at once, since a first draw of a new
 * character is a coin toss, then plain-language touch-ups on the one picked.
 */

const PROPOSALS = 2;

const generateSchema = z.object({
  description: z.string().trim().min(10, "Décris tes personnages en une phrase au moins.").max(1200, "Description trop longue (1 200 caractères maximum)."),
  style: z.enum(VISUAL_STYLES),
});

function sheetPrompt(description: string, style: (typeof VISUAL_STYLES)[number]): string {
  return [
    "Character sheet for a recurring series of short videos and carousels.",
    `Rendering style of the characters: ${ART_DIRECTIONS[style].prompt} Use only how the characters are rendered from this style; ignore any setting, background or depth-of-field it mentions.`,
    "Plain pure white background, no scenery, no floor texture, no props, no text, no labels, no logos.",
    "Every character shown once, full body, front view, standing side by side in one row, well separated, each one large and entirely visible, all at the same scale and under the same soft, even lighting. Each character has a clearly readable face with expressive eyes and a mouth.",
    `The characters: ${description}`,
  ].join("\n");
}

function failure(err: unknown): string {
  return err instanceof AiImageError || err instanceof Error ? err.message : "La génération a échoué.";
}

/** Draw PROPOSALS sheets from a description. Credits per image, refunded for each one that fails. */
export async function generateCharacterSheetsAction(input: unknown): Promise<ActionResult<{ urls: string[]; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.aiImages()) throw new Error("La génération d'images IA n'est pas configurée.");
    const parsed = generateSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Description invalide.");
    const { description, style } = parsed.data;

    const unit = isAdmin(user.role) ? 0 : CREDIT_COSTS.AI_IMAGE;
    let creditsLeft = unit > 0 ? await chargeCredits(user.id, unit * PROPOSALS, "SCRIPT_GENERATION", "Fiche personnages générée par IA") : user.credits;

    const prompt = sheetPrompt(description, style);
    const results = await Promise.allSettled(
      Array.from({ length: PROPOSALS }, async () => storeGeneratedImage(user.id, await generateImage({ prompt, aspectRatio: "16:9", timeoutMs: 75_000 }))),
    );
    const urls = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = results.length - urls.length;
    if (failed && unit > 0) creditsLeft = await refundCredits(user.id, unit * failed, "Remboursement — fiche personnages non générée");
    if (!urls.length) throw new Error(failure((results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason));
    return { urls, creditsLeft };
  });
}

const editSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  instruction: z.string().trim().min(3, "Dis ce qu'il faut changer.").max(500, "Consigne trop longue (500 caractères maximum)."),
});

/** Change one thing on a sheet («ajoute une bouche au cerveau»), keeping everything else. One image's credits. */
export async function editCharacterSheetAction(input: unknown): Promise<ActionResult<{ url: string; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.aiImages()) throw new Error("La génération d'images IA n'est pas configurée.");
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Consigne invalide.");
    const { url, instruction } = parsed.data;
    const image = isOwnImage(url, user.id) ? await readOwnImage(url, user.id) : null;
    if (!image) throw new Error("Cette image ne peut pas être retouchée : choisis-en une autre.");

    const unit = isAdmin(user.role) ? 0 : CREDIT_COSTS.AI_IMAGE;
    const creditsLeft = unit > 0 ? await chargeCredits(user.id, unit, "SCRIPT_GENERATION", "Retouche de la fiche personnages") : user.credits;
    try {
      const edited = await editImage({ image, instruction, aspectRatio: "16:9", timeoutMs: 75_000 });
      return { url: await storeGeneratedImage(user.id, edited), creditsLeft };
    } catch (err) {
      if (unit > 0) await refundCredits(user.id, unit, "Remboursement — retouche de la fiche personnages échouée");
      throw new Error(failure(err));
    }
  });
}
