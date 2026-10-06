"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, klingDurationFor, videoClipCost } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { visualLayersSchema } from "@/lib/validations";
import { sceneVisualDescriptions } from "@/lib/pipeline/visuals";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { absoluteUrl } from "@/lib/storage";
import { readOwnImage } from "@/lib/ai/images";
import { writeMotionPrompt } from "@/lib/ai/motion-prompt";
import type { GeneratedImage } from "@/lib/ai/image-generator";
import { guard, type ActionResult } from "@/server/action-result";
import type { VideoClipTier } from "@/lib/ai/video-clip-generator";

/**
 * Animates one scene's existing still into a short Kling clip (fal.ai) — a
 * deliberate, per-scene upgrade from the fixed pan/zoom every AI image gets
 * today, not a replacement for it: the still stays exactly as it is unless
 * this succeeds.
 *
 * A real generation takes minutes, so this only ever queues the job and
 * returns at once — the studio's own polling of /api/video-clips/[id] is
 * what actually drives it forward and swaps the layer once it lands.
 */
export async function animateSceneClipAction(projectId: string, layerId: string, tier: VideoClipTier): Promise<ActionResult<{ jobId: string; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!integrations.videoClips()) throw new Error("L'animation de scène n'est pas configurée.");

    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, include: { workspace: true } });
    const layers = visualLayersSchema.parse(project.visualLayers ?? []);
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== "image" || !layer.src) throw new Error("Cette scène n'a pas d'image à animer.");

    // A clip fal already produced, and billed, but that could not be followed or
    // fetched (a 405 on the status URL until it was fixed, a download that broke)
    // is still sitting at fal: pick it back up rather than paying for a new one.
    const unfetched = await prisma.videoClipJob.findFirst({
      where: {
        projectId,
        userId: user.id,
        layerId,
        tier,
        imageUrl: absoluteUrl(layer.src),
        status: "FAILED",
        falRequestId: { not: null },
        OR: [{ error: { startsWith: "Le suivi de l'animation a échoué" } }, { error: { startsWith: "La récupération du clip a échoué" } }, { error: { startsWith: "Le téléchargement du clip généré a échoué" } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (unfetched) {
      await prisma.videoClipJob.update({ where: { id: unfetched.id }, data: { status: "QUEUED", attempts: 0, error: null, lockedAt: null, lockedBy: null } });
      revalidatePath(`/studio/${projectId}`);
      return { jobId: unfetched.id, creditsLeft: user.credits };
    }

    let description = "";
    let spoken = "";
    // The clip covers its scene as the voice times it now, not the times stored when the image was made.
    let spanMs = layer.endMs - layer.startMs;
    if (layer.sceneIndex !== undefined && project.activeScriptId) {
      const script = await prisma.script.findFirst({ where: { id: project.activeScriptId, projectId } });
      if (script) {
        const voiceover = await prisma.voiceover.findFirst({ where: { projectId, scriptId: script.id, status: "READY" }, orderBy: { createdAt: "desc" } });
        const props = buildShortVideoProps({ project, script, voiceover, workspace: project.workspace, resolution: "1080p", watermark: false, snapCuts: false });
        description = sceneVisualDescriptions(props.scenes.length, script)[layer.sceneIndex]?.trim() ?? "";
        spoken = props.scenes[layer.sceneIndex]?.text ?? "";
        const aligned = props.visualLayers.find((l) => l.id === layer.id);
        if (aligned) spanMs = aligned.endMs - aligned.startMs;
      }
    }
    const duration = klingDurationFor(spanMs);

    const cost = isAdmin(user.role) ? 0 : videoClipCost(tier, duration);
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", `Animation de scène (Kling ${tier}, ${duration}s)`) : user.credits;

    // After the charge, so an account without the credits never pays for the writing either.
    // Motion written for the image actually on the scene (lib/ai/motion-prompt) — an imported photo
    // shows something else than the script's brief. The brief alone is the fallback.
    const still = await readStill(layer.src, user.id);
    const written = still ? await writeMotionPrompt(still, { spoken, brief: description, motif: project.visualMotif ?? "", durationSec: Number(duration) }) : null;
    const prompt = written ?? `${description || "Scène de vidéo courte, style réaliste."} Mouvement subtil, naturel et réaliste — pas de tremblement de caméra, pas de mouvement de caméra brusque, aucun texte ni logo ne doit apparaître.`;

    let job;
    try {
      job = await prisma.videoClipJob.create({
        data: { projectId, userId: user.id, layerId, imageUrl: absoluteUrl(layer.src), prompt, tier, duration, creditsCharged: cost },
      });
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la mise en file de l'animation a échoué");
      throw err;
    }

    revalidatePath(`/studio/${projectId}`);
    return { jobId: job.id, creditsLeft };
  });
}

/** The scene's still as bytes: from our storage, else by its public URL (a stock picture). Null when unreadable. */
async function readStill(src: string, userId: string): Promise<GeneratedImage | null> {
  const own = await readOwnImage(src, userId);
  if (own) return own;
  try {
    const res = await fetch(absoluteUrl(src), { signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length <= 15 * 1024 * 1024 ? { data, mimeType: type } : null;
  } catch {
    return null;
  }
}

/** Cancel a clip still queued or processing — refunds if it hadn't started producing anything yet. */
export async function cancelVideoClipJobAction(jobId: string): Promise<ActionResult<{ creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    const job = await prisma.videoClipJob.findFirst({ where: { id: jobId, userId: user.id } });
    if (!job) throw new Error("Introuvable.");
    if (job.status !== "QUEUED" && job.status !== "PROCESSING") throw new Error("Cette animation n'est plus en cours.");

    await prisma.videoClipJob.update({ where: { id: jobId }, data: { status: "FAILED", error: "Annulé par l'utilisateur", lockedAt: null, lockedBy: null } });
    const creditsLeft = job.creditsCharged > 0 ? await refundCredits(user.id, job.creditsCharged, "Remboursement — animation annulée") : user.credits;
    return { creditsLeft };
  });
}
