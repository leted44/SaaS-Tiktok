import { env } from "@/lib/env";

/**
 * Photo-realistic images for a carousel slide, via Gemini's image model
 * ("Nano Banana"). An alternative to stock search: instead of finding the
 * closest existing photo for a slide's subject, this creates the exact scene.
 *
 * Two defects are common enough in this model's output that every prompt
 * rules them out explicitly: hands (fingers rendered wrong, extra digits) and
 * legible text or clock faces (numbers come out garbled). Both are avoided at
 * the prompt level rather than filtered after the fact — there is no reliable
 * way to detect either from the pixels alone.
 */

const MODEL = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const STYLE = "Ultra-realistic, professional photograph, natural lighting, shallow depth of field, cinematic color grading, high detail, clean uncluttered background. Avoid depicting hands or fingers directly interacting with objects. Do not include any readable text, numbers, digital displays, or clock faces anywhere in the image. No watermarks, no logos, no brand names.";

export class AiImageError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "UPSTREAM") {
    super(message);
  }
}

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

/** `subject` is the scene to depict — a few concrete English words, e.g. an existing slide's `imageQuery`. */
export async function generateSlideImage(subject: string, aspectRatio: "1:1" | "4:5" | "9:16"): Promise<GeneratedImage> {
  if (!env.geminiApiKey) throw new AiImageError("La génération d'images IA n'est pas configurée (clé GEMINI_API_KEY manquante).", "NOT_CONFIGURED");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${subject}. ${STYLE}` }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
      }),
    });
  } catch {
    throw new AiImageError("Le service de génération d'images ne répond pas. Réessayez dans un instant.", "UPSTREAM");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new AiImageError(`La génération d'image a échoué (${res.status}).`, "UPSTREAM");

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] }; finishReason?: string }[];
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!image?.data) {
    if (json.candidates?.[0]?.finishReason === "SAFETY" || json.candidates?.[0]?.finishReason === "PROHIBITED_CONTENT") {
      throw new AiImageError("L'IA a refusé de générer cette image.", "REFUSED");
    }
    throw new AiImageError("L'IA n'a renvoyé aucune image. Réessayez.", "UPSTREAM");
  }
  return { data: Buffer.from(image.data, "base64"), mimeType: image.mimeType || "image/png" };
}
