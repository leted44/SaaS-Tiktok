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
 * Kling 2.5 Turbo, standard (720p) and pro (1080p). It replaced 2.1: better
 * prompt adherence and steadier motion, for less — on fal, 0.21$ / 0.35$ per
 * 5s clip against 0.28$ / 0.49$. Its image-to-video input is image_url,
 * prompt, duration ("5" | "10"), negative_prompt and cfg_scale; the clip
 * takes the shape of the image, so no aspect ratio is sent. fal versions its
 * Kling endpoints independently of Kling's own releases: re-check
 * https://fal.ai/models/fal-ai/kling-video if a real key ever reports a shape
 * mismatch (fal's error detail is passed through to the user).
 */

export type VideoClipTier = "standard" | "pro";

const ENDPOINT: Record<VideoClipTier, string> = {
  standard: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
  pro: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
};

const QUEUE_BASE = "https://queue.fal.run";

/**
 * Where a submitted job is followed. fal submits to the full endpoint path
 * but serves a request's status and result under the app id alone — its first
 * two segments, "fal-ai/kling-video" — and answers 405 to the full path
 * (the URLs in its own submit response, status_url and response_url, have
 * this shape).
 */
function requestUrl(tier: VideoClipTier, requestId: string): string {
  const app = ENDPOINT[tier].split("/").slice(0, 2).join("/");
  return `${QUEUE_BASE}/${app}/requests/${requestId}`;
}

export class VideoClipError extends Error {
  constructor(message: string, public code: "NOT_CONFIGURED" | "REFUSED" | "UPSTREAM") {
    super(message);
  }
}

function authHeaders(): HeadersInit {
  return { Authorization: `Key ${env.falApiKey}`, "Content-Type": "application/json" };
}

/** fal.ai's own error body (usually `{ detail: "..." }`) — the status code alone doesn't say whether a 403 is a bad key or an unfunded account. */
async function describeFailure(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; message?: unknown };
    const detail = typeof parsed.detail === "string" ? parsed.detail : typeof parsed.message === "string" ? parsed.message : null;
    if (detail) return `${res.status} : ${detail}`;
  } catch {
    // Not JSON — fall through to the raw status.
  }
  return body ? `${res.status} : ${body.slice(0, 200)}` : String(res.status);
}

/** Starts an animation. Returns fal's request id — there is nothing to poll yet the instant this resolves. */
export async function submitImageToVideo(imageUrl: string, prompt: string, tier: VideoClipTier, duration: KlingDuration): Promise<{ requestId: string }> {
  if (!env.falApiKey) throw new VideoClipError("L'animation de scène n'est pas configurée (clé FAL_API_KEY manquante).", "NOT_CONFIGURED");

  const res = await fetch(`${QUEUE_BASE}/${ENDPOINT[tier]}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ image_url: imageUrl, prompt: prompt.slice(0, 2500), duration }),
  });
  if (!res.ok) throw new VideoClipError(`La demande d'animation a échoué (${await describeFailure(res)}).`, "UPSTREAM");
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

  const statusRes = await fetch(`${requestUrl(tier, requestId)}/status`, { headers: authHeaders() });
  if (!statusRes.ok) throw new VideoClipError(`Le suivi de l'animation a échoué (${await describeFailure(statusRes)}).`, "UPSTREAM");
  const status = (await statusRes.json()) as { status?: string; error?: string };

  if (status.status === "COMPLETED") {
    const resultRes = await fetch(requestUrl(tier, requestId), { headers: authHeaders() });
    if (!resultRes.ok) throw new VideoClipError(`La récupération du clip a échoué (${await describeFailure(resultRes)}).`, "UPSTREAM");
    const result = (await resultRes.json()) as { video?: { url?: string }; error?: string };
    if (!result.video?.url) throw new VideoClipError(result.error ?? "fal.ai n'a renvoyé aucune vidéo.", "UPSTREAM");
    return { state: "completed", videoUrl: result.video.url };
  }
  if (status.status === "ERROR") return { state: "failed", message: status.error ?? "Échec inconnu côté fal.ai." };
  return { state: "pending" };
}
