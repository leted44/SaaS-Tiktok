import type { ImageModel } from "@/lib/ai/image-generator";

/**
 * The image model test, admin only, shared by the carousel and the video:
 * Pro everywhere, Nano Banana 2 everywhere, or Pro for the image that sets
 * the series (the carousel's cover, the video's first scene) and Nano Banana 2
 * for the rest. Everyone else always gets Pro.
 */
export type ImageModelChoice = "pro" | "flash" | "mix";

export function asImageModelChoice(value: unknown): ImageModelChoice {
  return value === "flash" || value === "mix" ? value : "pro";
}

/** The model that draws an image — `leads` is the series' first image, which "mix" keeps on Pro because it decides the scroll and sets the look. */
export function modelForImage(leads: boolean, choice: ImageModelChoice = "pro"): ImageModel {
  if (choice === "mix") return leads ? "pro" : "flash";
  return choice;
}
