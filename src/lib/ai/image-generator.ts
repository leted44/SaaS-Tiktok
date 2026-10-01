import { env } from "@/lib/env";

/**
 * Image generation with Gemini's image model ("Nano Banana").
 *
 * Takes a finished prompt — scene, series setting, art direction, framing and
 * rules are composed by lib/carousel/art-direction — plus, optionally, a
 * reference image: the first image of the series, handed back so the model
 * matches its light and colour instead of inventing a new look each time.
 */

/**
 * Nano Banana Pro is the default. Nano Banana 2 (3.1 Flash Image) costs half
 * (0.067$ against 0.134$ an image at 1K) and is under test from the admin
 * account only: it is reported to sometimes ignore the requested aspect ratio
 * — which every framing rule here depends on (subject up top, text below) —
 * and to be slower, so it stays opt-in until real carousels show otherwise.
 */
export type ImageModel = "pro" | "flash";
const MODELS: Record<ImageModel, string> = {
  pro: "gemini-3-pro-image-preview",
  flash: "gemini-3.1-flash-image-preview",
};
const endpoint = (model: ImageModel) => `https://generativelanguage.googleapis.com/v1beta/models/${MODELS[model]}:generateContent`;

export type ImageAspect = "1:1" | "4:5" | "9:16" | "16:9" | "5:4" | "21:9";

const REFERENCE_NOTE =
  "The attached image is the first picture of the same series. Match its art direction exactly — lighting, colour grade, lens, depth of field, texture and mood — so both images unmistakably belong together. Do NOT copy its subject or its composition: depict only the new scene described below.";

export class AiImageError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "UPSTREAM" | "RATE_LIMITED") {
    super(message);
  }
}

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

interface Options {
  prompt: string;
  aspectRatio: ImageAspect;
  reference?: GeneratedImage | null;
  /** Hard cap for one attempt. Batches pass a shorter one so a whole carousel fits in one request. */
  timeoutMs?: number;
  /** Which Gemini image model draws it — Pro unless a test says otherwise. */
  model?: ImageModel;
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { data?: string; mimeType?: string } }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

async function attempt({ prompt, aspectRatio, reference, timeoutMs = 60_000, model = "pro" }: Options): Promise<GeneratedImage> {
  const parts = reference
    ? [{ inlineData: { mimeType: reference.mimeType, data: reference.data.toString("base64") } }, { text: `${REFERENCE_NOTE}\n\n${prompt}` }]
    : [{ text: prompt }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(endpoint(model), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } } }),
    });
  } catch {
    throw new AiImageError("Le service de génération d'images ne répond pas. Réessaie dans un instant.", "UPSTREAM");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new AiImageError("Le service d'images est saturé. Réessaie dans une minute.", "RATE_LIMITED");
  if (!res.ok) throw new AiImageError(`La génération d'image a échoué (${res.status}).`, "UPSTREAM");

  const json = (await res.json()) as GeminiResponse;
  const candidate = json.candidates?.[0];
  // The Pro model can return draft "thought" images before the final one.
  const image = candidate?.content?.parts?.filter((p) => p.inlineData?.data && !p.thought).at(-1)?.inlineData;
  if (!image?.data) {
    if (json.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT" || candidate?.finishReason === "IMAGE_SAFETY") {
      throw new AiImageError("L'IA a refusé de générer cette image. Reformule la description de la scène.", "REFUSED");
    }
    throw new AiImageError("L'IA n'a renvoyé aucune image. Réessaie.", "UPSTREAM");
  }
  return { data: Buffer.from(image.data, "base64"), mimeType: image.mimeType || "image/png" };
}

/**
 * One retry, and only when the first failure came back fast: a transient
 * error is worth a second try, but a request that already used most of its
 * time would push the whole server action past its deadline.
 */
export async function generateImage(options: Options): Promise<GeneratedImage> {
  if (!env.geminiApiKey) throw new AiImageError("La génération d'images IA n'est pas configurée (clé GEMINI_API_KEY manquante).", "NOT_CONFIGURED");
  const started = Date.now();
  try {
    return await attempt(options);
  } catch (err) {
    const retryable = err instanceof AiImageError && err.code === "UPSTREAM" && Date.now() - started < 15_000;
    if (!retryable) throw err;
    return attempt(options);
  }
}
