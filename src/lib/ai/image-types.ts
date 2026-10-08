/** What every image provider here (Gemini, GPT Image) shares — kept apart so each provider's file can import it without a cycle. */

export type ImageAspect = "1:1" | "4:5" | "9:16" | "16:9" | "5:4" | "21:9";

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

/** The account's character sheet, or — for a space with a trained clone (lib/ai/clone) — the clone that draws its person. */
export interface CastImage extends GeneratedImage {
  clone?: { loraUrl: string; trigger: string } | null;
}

export class AiImageError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "UPSTREAM" | "RATE_LIMITED" | "UNAVAILABLE") {
    super(message);
  }
}
