"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { visualLayersSchema } from "@/lib/validations";
import { sceneVisualDescriptions } from "@/lib/pipeline/visuals";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { absoluteUrl } from "@/lib/storage";
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

    let description = "";
    if (layer.sceneIndex !== undefined && project.activeScriptId) {
      const script = await prisma.script.findFirst({ where: { id: project.activeScriptId, projectId } });
      if (script) {
        const voiceover = await prisma.voiceover.findFirst({ where: { projectId, scriptId: script.id, status: "READY" }, orderBy: { createdAt: "desc" } });
        const props = buildShortVideoProps({ project, script, voiceover, workspace: project.workspace, resolution: "1080p", watermark: false, snapCuts: false });
        description = sceneVisualDescriptions(props.scenes.length, script)[layer.sceneIndex]?.trim() ?? "";
      }
    }
    const prompt = `${description || "Scène de vidéo courte, style réaliste."} Mouvement subtil, naturel et réaliste — pas de tremblement de caméra, pas de mouvement de caméra brusque, aucun texte ni logo ne doit apparaître.`;

    const cost = isAdmin(user.role) ? 0 : CREDIT_COSTS[tier === "pro" ? "VIDEO_CLIP_PRO" : "VIDEO_CLIP_STANDARD"];
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", `Animation de scène (Kling ${tier})`) : user.credits;

    let job;
    try {
      job = await prisma.videoClipJob.create({
        data: { projectId, userId: user.id, layerId, imageUrl: absoluteUrl(layer.src), prompt, tier, creditsCharged: cost },
      });
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la mise en file de l'animation a échoué");
      throw err;
    }

    revalidatePath(`/studio/${projectId}`);
    return { jobId: job.id, creditsLeft };
  });
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
