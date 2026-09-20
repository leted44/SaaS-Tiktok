"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { voiceoverRequestSchema, scenesSchema, parseJson } from "@/lib/validations";
import { synthesizeSpeech } from "@/lib/tts";
import { getVoice } from "@/lib/tts/voices";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, effectivePlanDef, voiceoverCost } from "@/lib/plans";
import { putObject, storageKey } from "@/lib/storage";
import { estimateSpeechMs } from "@/lib/utils";
import { guard, type ActionResult } from "@/server/action-result";

export interface VoiceoverSummary {
  voiceoverId: string;
  audioUrl: string;
  durationMs: number;
  provider: string;
  creditsCharged: number;
}

export async function generateVoiceoverAction(input: unknown): Promise<ActionResult<VoiceoverSummary>> {
  return guard(async () => {
    const sessionUser = await requireUser();
    const data = voiceoverRequestSchema.parse(input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    const script = await prisma.script.findFirstOrThrow({ where: { id: data.scriptId, projectId: data.projectId, userId: user.id } });
    const voice = getVoice(data.voiceId);
    if (voice.premium && !effectivePlanDef(user).premiumVoices) {
      throw new Error(`${voice.name} est une voix premium. Passez au forfait Créateur ou supérieur pour l'utiliser.`);
    }

    const scenes = parseJson(scenesSchema, script.scenes, []);
    const segments = [script.hook, ...scenes.map((s) => s.text), script.callToAction];
    const estimatedMs = estimateSpeechMs(segments.join(" ")) / data.speed;
    const cost = isAdmin(user.role) ? 0 : voiceoverCost(estimatedMs);
    if (cost > 0) await chargeCredits(user.id, cost, "VOICEOVER", `Voix off (${voice.name})`, data.projectId);

    const voiceover = await prisma.voiceover.create({
      data: { projectId: data.projectId, scriptId: data.scriptId, userId: user.id, voiceId: voice.id, status: "PROCESSING", stability: data.stability, similarity: data.similarity, speed: data.speed },
    });

    try {
      const result = await synthesizeSpeech({ segments, voiceId: voice.id, options: { stability: data.stability, similarity: data.similarity, speed: data.speed } });
      const ext = result.mimeType === "audio/wav" ? "wav" : "mp3";
      const stored = await putObject(storageKey(user.id, "audio", `${voiceover.id}.${ext}`), result.audio, result.mimeType);
      await prisma.voiceover.update({
        where: { id: voiceover.id },
        data: { status: "READY", audioUrl: stored.url, durationMs: result.durationMs, wordTimings: result.wordTimings, provider: result.provider },
      });
      await prisma.project.update({ where: { id: data.projectId }, data: { status: "VOICED", voiceId: voice.id } });
      revalidatePath(`/studio/${data.projectId}`);
      return { voiceoverId: voiceover.id, audioUrl: stored.url, durationMs: result.durationMs, provider: result.provider, creditsCharged: cost };
    } catch (err) {
      await prisma.voiceover.update({ where: { id: voiceover.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) } });
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la voix off a échoué", voiceover.id);
      throw err;
    }
  });
}
