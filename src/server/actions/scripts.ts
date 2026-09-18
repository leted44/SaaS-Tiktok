"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateScriptSchema } from "@/lib/validations";
import { generateScript } from "@/lib/ai/script-generator";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/plans";
import { getCurrentWorkspace } from "@/server/queries";
import { guard, type ActionResult } from "@/server/action-result";
import { nanoid } from "nanoid";

export interface GeneratedScriptSummary {
  projectId: string;
  scriptId: string;
  version: number;
  viralityScore: number;
  creditsLeft: number;
}

export async function generateScriptAction(input: unknown): Promise<ActionResult<GeneratedScriptSummary>> {
  return guard(async () => {
    const user = await requireUser();
    const data = generateScriptSchema.parse(input);
    const workspace = await getCurrentWorkspace();

    // Charge first (atomic), refund if generation fails — never let a failed call eat credits.
    const creditsLeft = await chargeCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "SCRIPT_GENERATION", `Script: ${data.topic.slice(0, 60)}`);

    let result;
    try {
      result = await generateScript(data, { toneOfVoice: workspace.toneOfVoice, targetAudience: workspace.targetAudience });
    } catch (err) {
      await refundCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Refund — script generation failed");
      throw err;
    }

    const projectId =
      data.projectId ??
      (
        await prisma.project.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            title: result.script.title,
            topic: data.topic,
            niche: data.niche,
            sourceUrl: data.sourceUrl || null,
            targetDurationSec: data.targetDurationSec,
            language: data.language,
            aspectRatio: workspace.defaultAspect,
            voiceId: workspace.defaultVoiceId,
            musicTrackId: workspace.defaultMusicId,
          },
        })
      ).id;

    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id } });
    const latest = await prisma.script.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { version: true } });

    const script = await prisma.script.create({
      data: {
        projectId,
        userId: user.id,
        version: (latest?.version ?? 0) + 1,
        title: result.script.title,
        hook: result.script.hook,
        alternativeHooks: result.script.alternativeHooks,
        scenes: result.script.scenes.map((s) => ({ id: nanoid(8), ...s })),
        callToAction: result.script.callToAction,
        fullText: result.fullText,
        hashtags: result.script.hashtags,
        viralityScore: result.script.scores.virality,
        hookScore: result.script.scores.hook,
        retentionScore: result.script.scores.retention,
        clarityScore: result.script.scores.clarity,
        scoreRationale: result.script.scores.rationale,
        estimatedDurationSec: result.estimatedDurationSec,
        wordCount: result.wordCount,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { activeScriptId: script.id, status: "SCRIPTED", topic: project.topic ?? data.topic, niche: project.niche ?? data.niche },
    });

    revalidatePath("/scripts");
    revalidatePath("/projects");
    revalidatePath(`/studio/${projectId}`);
    return { projectId, scriptId: script.id, version: script.version, viralityScore: script.viralityScore, creditsLeft };
  });
}
