/** What every image provider here (Gemini, GPT Image) shares — kept apart so each provider's file can import it without a cycle. */

export type ImageAspect = "1:1" | "4:5" | "9:16" | "16:9" | "5:4" | "21:9";

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

export class AiImageError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "UPSTREAM" | "RATE_LIMITED" | "UNAVAILABLE") {
    super(message);
  }
}
