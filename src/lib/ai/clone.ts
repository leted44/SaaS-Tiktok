import { z } from "zod";
import { env } from "@/lib/env";
import { AiImageError, type GeneratedImage, type ImageAspect } from "@/lib/ai/image-types";

/**
 * The creator's "clone": a LoRA learned on 10 to 30 of their own photos
 * (fal.ai's FLUX LoRA trainer), so the AI images of their space show their
 * actual face. A reference photo sent with each image only gives the model
 * an idea of a face — it draws someone who looks related, never the person;
 * a LoRA is trained on that one person.
 *
 * Training: one queue job on fal (about 2 $ for 1 000 steps, some minutes),
 * followed by its status URL until the LoRA file is ready. Drawing: FLUX with
 * that LoRA, the trigger word naming the person in the prompt. Same key and
 * queue as GPT Image and Kling (FAL_API_KEY), so no other account.
 */

const TRAIN_ENDPOINT = "fal-ai/flux-lora-fast-training";
const DRAW_ENDPOINT = "fal-ai/flux-lora";
const TRAIN_STEPS = 1000;

export { CLONE_MAX_PHOTOS, CLONE_MIN_PHOTOS } from "@/lib/ai/clone-limits";

export const cloneStateSchema = z.object({
  status: z.enum(["training", "ready", "failed"]),
  /** The word the LoRA learned the person as: written into every prompt. */
  trigger: z.string(),
  /** One of the photos, shown on the card and sent where a picture of the person is needed. */
  photoUrl: z.string(),
  photos: z.number().int(),
  statusUrl: z.string().nullable().default(null),
  responseUrl: z.string().nullable().default(null),
  loraUrl: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  startedAt: z.string(),
  readyAt: z.string().nullable().default(null),
});
export type CloneState = z.infer<typeof cloneStateSchema>;

export function readClone(value: unknown): CloneState | null {
  const parsed = cloneStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What drawing needs: the trained file and the word it answers to. */
export interface CloneModel {
  loraUrl: string;
  trigger: string;
}

export function readyClone(value: unknown): CloneModel | null {
  const state = readClone(value);
  return state?.status === "ready" && state.loraUrl ? { loraUrl: state.loraUrl, trigger: state.trigger } : null;
}

const headers = (): HeadersInit => ({ Authorization: `Key ${env.falApiKey}`, "Content-Type": "application/json" });
const httpUrl = (url: unknown): url is string => typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://localhost"));

/** Start the training on a zip of the photos fal can download. */
export async function startCloneTraining(zipUrl: string, trigger: string): Promise<{ statusUrl: string; responseUrl: string }> {
  if (!env.falApiKey) throw new Error("L'entraînement n'est pas configuré (clé FAL_API_KEY manquante).");
  const res = await fetch(`${env.falQueueUrl}/${TRAIN_ENDPOINT}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ images_data_url: zipUrl, trigger_word: trigger, create_masks: true, steps: TRAIN_STEPS }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[clone] training refused ${res.status}: ${body.slice(0, 400)}`);
    throw new Error(res.status === 401 || res.status === 402 || res.status === 403 ? "Le compte fal.ai refuse l'entraînement (clé ou solde). Rien n'a été facturé." : `fal.ai a refusé l'entraînement (${res.status}).`);
  }
  const submit = (await res.json()) as { status_url?: string; response_url?: string };
  if (!httpUrl(submit.status_url) || !httpUrl(submit.response_url)) throw new Error("fal.ai n'a renvoyé aucun identifiant d'entraînement.");
  return { statusUrl: submit.status_url, responseUrl: submit.response_url };
}

/** Where a training stands: still running, done with its LoRA file, or failed with fal's reason. */
export async function checkCloneTraining(state: Pick<CloneState, "statusUrl" | "responseUrl">): Promise<{ status: "training" } | { status: "ready"; loraUrl: string } | { status: "failed"; error: string }> {
  if (!state.statusUrl || !state.responseUrl) return { status: "failed", error: "Entraînement introuvable." };
  const res = await fetch(state.statusUrl, { headers: headers(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return res.status >= 500 ? { status: "training" } : { status: "failed", error: `Suivi impossible (${res.status}).` };
  const { status } = (await res.json()) as { status?: string };
  if (status !== "COMPLETED") return { status: "training" };
  const out = await fetch(state.responseUrl, { headers: headers(), signal: AbortSignal.timeout(20_000) });
  const body = (await out.json().catch(() => null)) as { diffusers_lora_file?: { url?: string }; detail?: unknown } | null;
  const loraUrl = body?.diffusers_lora_file?.url;
  if (out.ok && httpUrl(loraUrl)) return { status: "ready", loraUrl };
  console.error(`[clone] training ended without a LoRA (${out.status}): ${JSON.stringify(body).slice(0, 400)}`);
  return { status: "failed", error: "L'entraînement s'est terminé sans modèle. Essaie avec d'autres photos (nettes, toi seul, angles variés)." };
}

/** FLUX sizes: multiples of 16, close to the other models' resolution for a phone screen. */
const SIZE: Record<ImageAspect, { width: number; height: number }> = {
  "9:16": { width: 864, height: 1536 },
  "4:5": { width: 1024, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1536, height: 864 },
  "5:4": { width: 1280, height: 1024 },
  "21:9": { width: 1536, height: 656 },
};

/**
 * One image of the scene with the creator's face. The trigger word opens the
 * prompt (FLUX reads the start of a long prompt most reliably) and names the
 * person, so the model draws the one it was trained on.
 */
export async function generateWithClone(options: { clone: CloneModel; prompt: string; aspectRatio: ImageAspect; timeoutMs: number }): Promise<GeneratedImage> {
  if (!env.falApiKey) throw new AiImageError("Le clone n'est pas configuré (clé FAL_API_KEY manquante).", "NOT_CONFIGURED");
  const { clone, aspectRatio } = options;
  const deadline = Date.now() + Math.max(options.timeoutMs, 60_000);
  const left = () => Math.max(1_000, deadline - Date.now());
  const tooSlow = () => new AiImageError("Le service de génération d'images ne répond pas. Réessaie dans un instant.", "UPSTREAM");
  const prompt = `Photo of ${clone.trigger}. The person in this image is ${clone.trigger}, with exactly ${clone.trigger}'s face, features, skin tone, hair and build.\n${options.prompt}`;
  const body = { prompt, loras: [{ path: clone.loraUrl, scale: 1 }], image_size: SIZE[aspectRatio], num_inference_steps: 28, guidance_scale: 3.5, num_images: 1, enable_safety_checker: true, output_format: "jpeg" };

  try {
    const res = await fetch(`${env.falQueueUrl}/${DRAW_ENDPOINT}`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(left()) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[clone] ${res.status} on ${DRAW_ENDPOINT}: ${text.slice(0, 400)}`);
      if (res.status === 429) throw new AiImageError("Le service d'images est saturé. Réessaie dans une minute.", "RATE_LIMITED");
      throw new AiImageError(`La génération avec ton clone a échoué (${res.status}). Réessaie dans un instant : tes crédits ont été remboursés.`, res.status === 401 || res.status === 402 || res.status === 403 ? "UNAVAILABLE" : "UPSTREAM");
    }
    const submit = (await res.json()) as { status_url?: string; response_url?: string };
    if (!httpUrl(submit.status_url) || !httpUrl(submit.response_url)) throw new AiImageError("fal.ai n'a renvoyé aucun identifiant de tâche.", "UPSTREAM");
    for (;;) {
      if (Date.now() >= deadline) throw tooSlow();
      const st = await fetch(submit.status_url, { headers: headers(), signal: AbortSignal.timeout(left()) });
      if (st.ok && ((await st.json()) as { status?: string }).status === "COMPLETED") break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, left())));
    }
    const out = await fetch(submit.response_url, { headers: headers(), signal: AbortSignal.timeout(left()) });
    const result = (await out.json().catch(() => null)) as { images?: { url?: string }[]; has_nsfw_concepts?: boolean[] } | null;
    if (result?.has_nsfw_concepts?.[0]) throw new AiImageError("L'IA a refusé de générer cette image. Reformule la description de la scène.", "REFUSED");
    const url = result?.images?.[0]?.url;
    if (!out.ok || !httpUrl(url)) throw new AiImageError("L'IA n'a renvoyé aucune image. Réessaie.", "UPSTREAM");
    const file = await fetch(url, { signal: AbortSignal.timeout(left() + 10_000) });
    if (!file.ok) throw new AiImageError("Le téléchargement de l'image générée a échoué. Réessaie.", "UPSTREAM");
    return { data: Buffer.from(await file.arrayBuffer()), mimeType: file.headers.get("content-type")?.split(";")[0] || "image/jpeg" };
  } catch (err) {
    if (err instanceof AiImageError) throw err;
    throw tooSlow();
  }
}
