import { env } from "@/lib/env";
import type { KlingDuration } from "@/lib/plans";

/**
 * Animates one scene's still into a short clip with Kling (image-to-video),
 * via fal.ai's queue API.
 *
 * A generation takes anywhere from 30 seconds to several minutes — far past
 * what a single request can wait on — so this is submit-then-poll, not
 * request-response: submitImageToVideo() starts the job and returns fal's own
 * request id at once; checkVideoStatus() is called again later (by the studio's
 * polling or the worker tick) to see whether it is done.
 *
 * Endpoint and field names are fal's documented image-to-video contract for
 * Kling 2.1 as of this writing — fal versions its Kling endpoints (v1, v2.1,
 * v2.6, v3…) independently of Kling's own releases, so this is worth
 * re-checking against https://fal.ai/models/fal-ai/kling-video if a real key
 * ever reports a shape mismatch.
 */

export type VideoClipTier = "standard" | "pro";

const ENDPOINT: Record<VideoClipTier, string> = {
  standard: "fal-ai/kling-video/v2.1/standard/image-to-video",
  pro: "fal-ai/kling-video/v2.1/pro/image-to-video",
};

const QUEUE_BASE = "https://queue.fal.run";

export class VideoClipError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "UPSTREAM") {
    super(message);
  }
}

function authHeaders(): HeadersInit {
  return { Authorization: `Key ${env.falApiKey}`, "Content-Type": "application/json" };
}

/** Starts an animation. Returns fal's request id — there is nothing to poll yet the instant this resolves. */
export async function submitImageToVideo(imageUrl: string, prompt: string, tier: VideoClipTier, duration: KlingDuration): Promise<{ requestId: string }> {
  if (!env.falApiKey) throw new VideoClipError("L'animation de scène n'est pas configurée (clé FAL_API_KEY manquante).", "NOT_CONFIGURED");

  const res = await fetch(`${QUEUE_BASE}/${ENDPOINT[tier]}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ image_url: imageUrl, prompt: prompt.slice(0, 2500), duration, aspect_ratio: "9:16" }),
  });
  if (!res.ok) throw new VideoClipError(`La demande d'animation a échoué (${res.status}).`, "UPSTREAM");
  const json = (await res.json()) as { request_id?: string };
  if (!json.request_id) throw new VideoClipError("fal.ai n'a renvoyé aucun identifiant de tâche.", "UPSTREAM");
  return { requestId: json.request_id };
}

export type VideoClipStatus =
  | { state: "pending" }
  | { state: "completed"; videoUrl: string }
  | { state: "failed"; message: string };

/** One check — never blocks waiting for completion, so it fits inside a poll tick. */
export async function checkVideoStatus(requestId: string, tier: VideoClipTier): Promise<VideoClipStatus> {
  if (!env.falApiKey) throw new VideoClipError("L'animation de scène n'est pas configurée (clé FAL_API_KEY manquante).", "NOT_CONFIGURED");

  const statusRes = await fetch(`${QUEUE_BASE}/${ENDPOINT[tier]}/requests/${requestId}/status`, { headers: authHeaders() });
  if (!statusRes.ok) throw new VideoClipError(`Le suivi de l'animation a échoué (${statusRes.status}).`, "UPSTREAM");
  const status = (await statusRes.json()) as { status?: string; error?: string };

  if (status.status === "COMPLETED") {
    const resultRes = await fetch(`${QUEUE_BASE}/${ENDPOINT[tier]}/requests/${requestId}`, { headers: authHeaders() });
    if (!resultRes.ok) throw new VideoClipError(`La récupération du clip a échoué (${resultRes.status}).`, "UPSTREAM");
    const result = (await resultRes.json()) as { video?: { url?: string }; error?: string };
    if (!result.video?.url) throw new VideoClipError(result.error ?? "fal.ai n'a renvoyé aucune vidéo.", "UPSTREAM");
    return { state: "completed", videoUrl: result.video.url };
  }
  if (status.status === "ERROR") return { state: "failed", message: status.error ?? "Échec inconnu côté fal.ai." };
  return { state: "pending" };
}
