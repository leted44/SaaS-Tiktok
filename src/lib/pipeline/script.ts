import type { User, Workspace } from "@prisma/client";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { generateScript } from "@/lib/ai/script-generator";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import type { GenerateScriptInput } from "@/lib/validations";

export interface GeneratedScriptSummary {
  projectId: string;
  scriptId: string;
  version: number;
  viralityScore: number;
  creditsLeft: number;
}

/**
 * Write a script for a user and attach it to a project (a new one unless
 * `data.projectId` names one of theirs). The studio's "Générer" button and the
 * autopilot both come through here, so a scheduled video is billed and stored
 * exactly like one made by hand.
 */
export async function createScript(user: Pick<User, "id" | "role" | "credits">, workspace: Workspace, data: GenerateScriptInput): Promise<GeneratedScriptSummary> {
  // Charge first (atomic), refund if generation fails — never let a failed call eat credits.
  const admin = isAdmin(user.role);
  const creditsLeft = admin
    ? user.credits
    : await chargeCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "SCRIPT_GENERATION", `Script : ${data.topic.slice(0, 60)}`);

  let result;
  try {
    result = await generateScript(data, { toneOfVoice: workspace.toneOfVoice, targetAudience: workspace.targetAudience });
  } catch (err) {
    if (!admin) await refundCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Remboursement — la génération du script a échoué");
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
      socialCopy: result.script.socialCopy,
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

  return { projectId, scriptId: script.id, version: script.version, viralityScore: script.viralityScore, creditsLeft };
}
