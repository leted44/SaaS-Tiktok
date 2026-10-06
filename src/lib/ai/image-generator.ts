import { env } from "@/lib/env";
import { CAST_NOTE } from "@/lib/ai/gemini-prompt";
import { AiImageError, type GeneratedImage, type ImageAspect } from "@/lib/ai/image-types";
import { generateWithGpt, gptAttemptMs, isGptModel, type GptImageModel } from "@/lib/ai/gpt-image";

export { AiImageError, type GeneratedImage, type ImageAspect };

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
type GeminiModel = "pro" | "flash";
/** Gemini's two (Nano Banana 2, Pro) and OpenAI's GPT Image 2 at two qualities, the latter through fal.ai (lib/ai/gpt-image). */
export type ImageModel = GeminiModel | GptImageModel;
const MODELS: Record<GeminiModel, string> = {
  pro: "gemini-3-pro-image-preview",
  flash: "gemini-3.1-flash-image-preview",
};
const endpoint = (model: GeminiModel) => `https://generativelanguage.googleapis.com/v1beta/models/${MODELS[model]}:generateContent`;

/**
 * How the series' first image is to be used: its look always, its recurring
 * person or character when the new scene has them too — a series whose
 * athlete changes face, or gender, from one slide to the next reads as stock
 * photos. The action and framing always come from the new description.
 */
const REFERENCE_NOTE =
  "The attached image is the first image of the same series. Keep its art direction exactly — lighting, colour grade, lens, depth of field, texture and mood — so both images unmistakably belong together. If the new scene features the same recurring person or character, keep them identical: same face, hair, skin tone, build and outfit. The action, pose, camera angle and framing come only from the new description below, not from the attached image.";

/**
 * How the account's character sheet is to be used: the creator's own drawing
 * of the recurring characters, the same for every post — where the series'
 * first image only holds one post together, the sheet holds the account
 * together, so a mascot looks the same in every video and carousel.
 */

const REFERENCE_AFTER_CAST_NOTE =
  "The second attached image is the first image of the same series. Keep its art direction exactly — lighting, colour grade, lens, depth of field, texture and mood — so both images unmistakably belong together. The action, pose, camera angle and framing come only from the new description below, not from either attached image.";

interface Options {
  prompt: string;
  aspectRatio: ImageAspect;
  reference?: GeneratedImage | null;
  /** The account's character sheet (Space or project "Image de référence"), sent with every image when set. */
  cast?: GeneratedImage | null;
  /** Hard cap for one attempt. Batches pass a shorter one so a whole carousel fits in one request (the first attempt of GPT Image never gets less than its own floor, see attemptMs). */
  timeoutMs?: number;
  /** Which Gemini image model draws it — Nano Banana 2 unless a test says otherwise. */
  model?: ImageModel;
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { data?: string; mimeType?: string } }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

/** The first attempt's time cap: the batch's own, but never below what the chosen model needs to draw one image. */
export function attemptMs(model: ImageModel | undefined, requested?: number): number {
  const base = requested ?? 60_000;
  return model && isGptModel(model) ? Math.max(base, gptAttemptMs(model)) : base;
}

const inline = (image: GeneratedImage) => ({ inlineData: { mimeType: image.mimeType, data: image.data.toString("base64") } });

/** The reference images in the order the prompt's notes name them, and the prompt with those notes — the same for every provider. */
function withReferences(prompt: string, reference: GeneratedImage | null | undefined, cast: GeneratedImage | null | undefined): { images: GeneratedImage[]; text: string } {
  if (cast && reference) return { images: [cast, reference], text: `${CAST_NOTE}\n\n${REFERENCE_AFTER_CAST_NOTE}\n\n${prompt}` };
  if (cast) return { images: [cast], text: `${CAST_NOTE}\n\n${prompt}` };
  if (reference) return { images: [reference], text: `${REFERENCE_NOTE}\n\n${prompt}` };
  return { images: [], text: prompt };
}

function partsFor(prompt: string, reference: GeneratedImage | null | undefined, cast: GeneratedImage | null | undefined) {
  const { images, text } = withReferences(prompt, reference, cast);
  return [...images.map(inline), { text }];
}

async function attempt({ prompt, aspectRatio, reference, cast, edit, timeoutMs, model = "flash" }: Options & { edit?: GeneratedImage }): Promise<GeneratedImage> {
  if (isGptModel(model)) {
    const { images, text } = edit ? { images: [edit], text: prompt } : withReferences(prompt, reference, cast);
    // A caller's cap is kept as given: the corrections of checked-image size theirs to the time left in the request.
    return generateWithGpt({ model, prompt: text, aspectRatio, images, timeoutMs: timeoutMs ?? gptAttemptMs(model) });
  }
  const parts = edit ? [inline(edit), { text: prompt }] : partsFor(prompt, reference, cast);
  timeoutMs ??= 60_000;

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
  // Billing or key trouble on the app's own Google account (402: payment
  // required, 401/403: key refused) — only the owner can fix it, so the cause
  // goes to the logs and the creator is told plainly; never retried.
  if (res.status === 401 || res.status === 402 || res.status === 403) {
    console.error(`[gemini] ${res.status} on ${MODELS[model]} — check billing and the API key of the Google AI account behind GEMINI_API_KEY: ${(await res.text()).slice(0, 400)}`);
    throw new AiImageError("La génération d'images est momentanément indisponible. Réessaie un peu plus tard : tes crédits ont été remboursés.", "UNAVAILABLE");
  }
  if (!res.ok) throw new AiImageError(`La génération d'image a échoué (${res.status}). Réessaie dans un instant : tes crédits ont été remboursés.`, "UPSTREAM");

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
  if (!isGptModel(options.model ?? "flash") && !env.geminiApiKey) throw new AiImageError("La génération d'images IA n'est pas configurée (clé GEMINI_API_KEY manquante).", "NOT_CONFIGURED");
  const started = Date.now();
  try {
    return await attempt(options);
  } catch (err) {
    const retryable = err instanceof AiImageError && err.code === "UPSTREAM" && Date.now() - started < 15_000;
    if (!retryable) throw err;
    return attempt(options);
  }
}

/**
 * Correct one defect of an image without redrawing it — Google's advice for
 * its image models is to edit an image that is mostly right rather than roll
 * a new one, which would bring new defects of its own.
 */
export async function editImage(options: { image: GeneratedImage; instruction: string; aspectRatio: ImageAspect; timeoutMs?: number; model?: ImageModel }): Promise<GeneratedImage> {
  if (!isGptModel(options.model ?? "flash") && !env.geminiApiKey) throw new AiImageError("La génération d'images IA n'est pas configurée (clé GEMINI_API_KEY manquante).", "NOT_CONFIGURED");
  const prompt = `Edit the attached image: ${options.instruction.trim().replace(/[.\s]+$/, "")}. Keep everything else exactly as it is — the same person, pose, framing, lighting, colours and background. The image contains no text of any kind.`;
  return attempt({ prompt, aspectRatio: options.aspectRatio, edit: options.image, timeoutMs: options.timeoutMs, model: options.model });
}
