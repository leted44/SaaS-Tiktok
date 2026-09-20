"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { generateScriptSchema, scenesSchema, parseJson } from "@/lib/validations";
import { generateScript } from "@/lib/ai/script-generator";
import { generateSocialCopy } from "@/lib/ai/caption-generator";
import type { SocialCopy } from "@/lib/social/captions";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
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
    // Fresh DB read, not the session's role: a role granted after the user's
    // last login stays stale in their JWT for up to 30 days otherwise.
    const user = await requireDbUser();
    const data = generateScriptSchema.parse(input);
    const workspace = await getCurrentWorkspace();

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

    revalidatePath("/scripts");
    revalidatePath("/projects");
    revalidatePath(`/studio/${projectId}`);
    return { projectId, scriptId: script.id, version: script.version, viralityScore: script.viralityScore, creditsLeft };
  });
}

/** Rewrites just the post captions for an existing script — a weak caption shouldn't cost a whole new script. */
export async function regenerateSocialCopyAction(scriptId: string): Promise<ActionResult<{ socialCopy: SocialCopy; creditsLeft: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    const script = await prisma.script.findFirstOrThrow({
      where: { id: scriptId, userId: user.id },
      include: { project: { include: { workspace: true } } },
    });

    const admin = isAdmin(user.role);
    const cost = admin ? 0 : CREDIT_COSTS.SOCIAL_COPY;
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", "Régénération de la description") : user.credits;

    let socialCopy: SocialCopy;
    try {
      socialCopy = await generateSocialCopy({
        title: script.title,
        hook: script.hook,
        sceneTexts: parseJson(scenesSchema, script.scenes, []).map((s) => s.text),
        callToAction: script.callToAction,
        language: script.project.language,
        niche: script.project.niche,
        toneOfVoice: script.project.workspace.toneOfVoice,
        targetAudience: script.project.workspace.targetAudience,
      });
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la régénération de la description a échoué");
      throw err;
    }

    await prisma.script.update({ where: { id: script.id }, data: { socialCopy } });
    revalidatePath(`/studio/${script.projectId}`);
    return { socialCopy, creditsLeft };
  });
}
