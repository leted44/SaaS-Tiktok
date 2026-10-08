import type { ImageModel } from "@/lib/ai/image-generator";

/**
 * The image model, shared by the carousel and the video. Everyone draws with
 * Nano Banana 2: the owner compared it with Pro on a real export and kept it,
 * for half the price per image. The admin can still test Pro everywhere, or
 * Pro for the image that sets the series (the carousel's cover, the video's
 * first scene) and Nano Banana 2 for the rest — or GPT Image 2 (OpenAI, through
 * fal.ai) at medium or high quality, which the owner's side-by-side of the same
 * three scenes ranked first. Admin only until its price and look are settled.
 * « Mon clone » draws with the space's trained clone (lib/ai/clone), when it has
 * one, and with Nano Banana 2 elsewhere.
 */
export type ImageModelChoice = "pro" | "flash" | "mix" | "gpt-medium" | "gpt-high" | "clone";

/** What every client gets, and what the admin test starts on. */
export const DEFAULT_IMAGE_MODEL: ImageModelChoice = "flash";

export function asImageModelChoice(value: unknown): ImageModelChoice {
  return value === "pro" || value === "flash" || value === "mix" || value === "gpt-medium" || value === "gpt-high" || value === "clone" ? value : DEFAULT_IMAGE_MODEL;
}

/** The model that draws an image — `leads` is the series' first image, which "mix" keeps on Pro because it decides the scroll and sets the look. */
export function modelForImage(leads: boolean, choice: ImageModelChoice = DEFAULT_IMAGE_MODEL): ImageModel {
  if (choice === "mix") return leads ? "pro" : "flash";
  return choice;
}
