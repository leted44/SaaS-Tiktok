import { env } from "@/lib/env";
import { AiImageError, type GeneratedImage, type ImageAspect } from "@/lib/ai/image-types";

/**
 * Image generation with OpenAI's GPT Image 2, through fal.ai — the key that
 * already animates scenes (FAL_API_KEY), so no second account or bill.
 *
 * Two endpoints: text-to-image, and "edit", which takes up to a few reference
 * images — the character sheet and the series' first image go there, exactly
 * as they go to Gemini. Quality is the price lever (lib/ai/image-models):
 * the model produces about four times more image detail on "high" than on
 * "medium", and is billed for it.
 *
 * Like Kling, a job is submitted to fal's queue and followed by the URLs fal
 * returns (never rebuilt from the endpoint path — fal answers 405 to those).
 */

export type GptImageModel = "gpt-medium" | "gpt-high";
export const isGptModel = (model: string): model is GptImageModel => model === "gpt-medium" || model === "gpt-high";

const QUALITY: Record<GptImageModel, "medium" | "high"> = { "gpt-medium": "medium", "gpt-high": "high" };
const TEXT_ENDPOINT = "openai/gpt-image-2";
const EDIT_ENDPOINT = "openai/gpt-image-2/edit";

/**
 * Sizes fal accepts: both sides multiples of 16, at least 655 360 pixels,
 * ratio at most 3:1. Exact ratios, a little above Gemini's 1K, billed by pixel
 * count — so no bigger than needed for a phone screen.
 */
const SIZE: Record<ImageAspect, { width: number; height: number }> = {
  "9:16": { width: 864, height: 1536 },
  "4:5": { width: 1024, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1536, height: 864 },
  "5:4": { width: 1280, height: 1024 },
  "21:9": { width: 1536, height: 656 },
};

/** One attempt's time floor: the "high" quality takes the longest to draw. */
export function gptAttemptMs(model: GptImageModel): number {
  return model === "gpt-high" ? 100_000 : 70_000;
}

const POLL_MS = 2_000;

type QueueSubmit = { request_id?: string; status_url?: string; response_url?: string; cancel_url?: string };
type QueueStatus = { status?: string };
type GptResult = { images?: { url?: string; content_type?: string }[] };

const headers = (): HeadersInit => ({ Authorization: `Key ${env.falApiKey}`, "Content-Type": "application/json" });
const dataUri = (image: GeneratedImage) => `data:${image.mimeType};base64,${image.data.toString("base64")}`;

async function failure(res: Response, what: string): Promise<AiImageError> {
  const body = await res.text().catch(() => "");
  if (res.status === 429) return new AiImageError("Le service d'images est saturé. Réessaie dans une minute.", "RATE_LIMITED");
  if (res.status === 401 || res.status === 402 || res.status === 403) {
    console.error(`[gpt-image] ${res.status} on ${what} — check the balance and the key of the fal.ai account behind FAL_API_KEY: ${body.slice(0, 400)}`);
    return new AiImageError("La génération d'images est momentanément indisponible. Réessaie un peu plus tard : tes crédits ont été remboursés.", "UNAVAILABLE");
  }
  if (/content[_ ]policy|safety|moderation/i.test(body)) return new AiImageError("L'IA a refusé de générer cette image. Reformule la description de la scène.", "REFUSED");
  console.error(`[gpt-image] ${res.status} on ${what}: ${body.slice(0, 400)}`);
  return new AiImageError(`La génération d'image a échoué (${res.status}). Réessaie dans un instant : tes crédits ont été remboursés.`, "UPSTREAM");
}

/**
 * One image, from a prompt and optionally reference images (in the order the
 * prompt's notes name them: character sheet first, then the series' first image).
 */
export async function generateWithGpt(options: { model: GptImageModel; prompt: string; aspectRatio: ImageAspect; images?: GeneratedImage[]; timeoutMs: number }): Promise<GeneratedImage> {
  if (!env.falApiKey) throw new AiImageError("La génération d'images GPT n'est pas configurée (clé FAL_API_KEY manquante).", "NOT_CONFIGURED");
  const { model, prompt, aspectRatio, images = [], timeoutMs } = options;
  const endpoint = images.length ? EDIT_ENDPOINT : TEXT_ENDPOINT;
  const deadline = Date.now() + timeoutMs;
  const left = () => Math.max(1_000, deadline - Date.now());
  const tooSlow = () => new AiImageError("Le service de génération d'images ne répond pas. Réessaie dans un instant.", "UPSTREAM");

  const body = { prompt, image_size: SIZE[aspectRatio], quality: QUALITY[model], num_images: 1, output_format: "png", ...(images.length ? { image_urls: images.map(dataUri) } : {}) };

  let submit: QueueSubmit;
  try {
    const res = await fetch(`${env.falQueueUrl}/${endpoint}`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(left()) });
    if (!res.ok) throw await failure(res, endpoint);
    submit = (await res.json()) as QueueSubmit;
  } catch (err) {
    if (err instanceof AiImageError) throw err;
    throw tooSlow();
  }
  if (!submit.status_url || !submit.response_url) throw new AiImageError("fal.ai n'a renvoyé aucun identifiant de tâche.", "UPSTREAM");

  const cancel = () => {
    // Best effort: a job nobody waits for any more should not run to the end.
    if (submit.cancel_url) void fetch(submit.cancel_url, { method: "PUT", headers: headers(), signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
  };

  try {
    for (;;) {
      if (Date.now() >= deadline) throw tooSlow();
      const res = await fetch(submit.status_url, { headers: headers(), signal: AbortSignal.timeout(left()) });
      if (!res.ok) throw await failure(res, `${endpoint} status`);
      if (((await res.json()) as QueueStatus).status === "COMPLETED") break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_MS, left())));
    }
    const res = await fetch(submit.response_url, { headers: headers(), signal: AbortSignal.timeout(left()) });
    if (!res.ok) throw await failure(res, `${endpoint} result`);
    const url = ((await res.json()) as GptResult).images?.[0]?.url;
    if (!url || !url.startsWith("https://") && !url.startsWith("http://localhost")) throw new AiImageError("L'IA n'a renvoyé aucune image. Réessaie.", "UPSTREAM");
    const file = await fetch(url, { signal: AbortSignal.timeout(left() + 10_000) });
    if (!file.ok) throw new AiImageError("Le téléchargement de l'image générée a échoué. Réessaie.", "UPSTREAM");
    return { data: Buffer.from(await file.arrayBuffer()), mimeType: file.headers.get("content-type")?.split(";")[0] || "image/png" };
  } catch (err) {
    cancel();
    if (err instanceof AiImageError) throw err;
    throw tooSlow();
  }
}
