"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { generateScriptSchema, scenesSchema, parseJson } from "@/lib/validations";
import { createScript, type GeneratedScriptSummary } from "@/lib/pipeline/script";
import { generateSeries, MIN_SERIES_PARTS, MAX_SERIES_PARTS } from "@/lib/ai/series-generator";
import { generateSocialCopy } from "@/lib/ai/caption-generator";
import type { SocialCopy } from "@/lib/social/captions";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, effectivePlanDef, CREDIT_COSTS } from "@/lib/plans";
import { getCurrentWorkspace } from "@/server/queries";
import { guard, type ActionResult } from "@/server/action-result";
import { nanoid } from "nanoid";

export async function generateScriptAction(input: unknown): Promise<ActionResult<GeneratedScriptSummary>> {
  return guard(async () => {
    // Fresh DB read, not the session's role: a role granted after the user's
    // last login stays stale in their JWT for up to 30 days otherwise.
    const user = await requireDbUser();
    const data = generateScriptSchema.parse(input);
    const workspace = await getCurrentWorkspace();
    const summary = await createScript(user, workspace, data);

    revalidatePath("/scripts");
    revalidatePath("/projects");
    revalidatePath(`/studio/${summary.projectId}`);
    return summary;
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

export interface SeriesEpisodeSummary {
  projectId: string;
  scriptId: string;
  title: string;
  episodeNumber: number;
  viralityScore: number;
}

export interface SeriesResult {
  seriesTitle: string;
  episodes: SeriesEpisodeSummary[];
  creditsLeft: number;
}

/**
 * Split one script into a multi-part series, one project per episode.
 *
 * Each episode has to be its own project: the state a finished video needs —
 * visual layers, caption style, music — lives on Project, and episodes cannot
 * share it, since they have different scenes of different lengths. The look is
 * copied across so the series stays visually consistent; the visuals themselves
 * are not, because they belong to scenes that no longer exist.
 */
export async function splitIntoSeriesAction(scriptId: string, parts: number): Promise<ActionResult<SeriesResult>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!Number.isInteger(parts) || parts < MIN_SERIES_PARTS || parts > MAX_SERIES_PARTS) {
      throw new Error(`Une série compte entre ${MIN_SERIES_PARTS} et ${MAX_SERIES_PARTS} épisodes.`);
    }

    const script = await prisma.script.findFirstOrThrow({
      where: { id: scriptId, userId: user.id },
      include: { project: { include: { workspace: true } } },
    });
    const source = script.project;

    // Checked before charging: a series that cannot be created must not cost anything.
    const planDef = effectivePlanDef(user);
    if (planDef.maxProjects > 0) {
      const existing = await prisma.project.count({ where: { userId: user.id } });
      if (existing + parts > planDef.maxProjects) {
        const room = Math.max(0, planDef.maxProjects - existing);
        throw new Error(
          `Une série de ${parts} épisodes crée ${parts} projets, et votre forfait ${planDef.name} en autorise ${planDef.maxProjects} au total (${room} restant${room > 1 ? "s" : ""}). Supprimez des projets ou passez à un forfait supérieur.`,
        );
      }
    }

    const admin = isAdmin(user.role);
    const cost = admin ? 0 : CREDIT_COSTS.SCRIPT_GENERATION * parts;
    const creditsLeft = cost > 0 ? await chargeCredits(user.id, cost, "SCRIPT_GENERATION", `Série ${parts} épisodes : ${script.title.slice(0, 50)}`) : user.credits;

    let result;
    try {
      result = await generateSeries(
        {
          title: script.title,
          hook: script.hook,
          sceneTexts: parseJson(scenesSchema, script.scenes, []).map((s) => s.text),
          callToAction: script.callToAction,
          topic: source.topic,
          niche: source.niche,
          language: source.language,
          targetDurationSec: source.targetDurationSec,
          toneOfVoice: source.workspace.toneOfVoice,
          targetAudience: source.workspace.targetAudience,
        },
        parts,
      );
    } catch (err) {
      if (cost > 0) await refundCredits(user.id, cost, "Remboursement — la génération de la série a échoué");
      throw err;
    }

    const seriesId = nanoid(12);
    // One transaction: a half-created series would leave orphan projects behind
    // and no way for the user to tell which episodes actually exist.
    const episodes = await prisma.$transaction(async (tx) => {
      const created: SeriesEpisodeSummary[] = [];
      for (const [index, episode] of result.episodes.entries()) {
        // Numbered here rather than left to the model: the projects list shows
        // titles alone, and an unnumbered series is unorderable at a glance.
        const title = `${episode.script.title} (${index + 1}/${result.episodes.length})`;
        const project = await tx.project.create({
          data: {
            userId: user.id,
            workspaceId: source.workspaceId,
            title,
            topic: source.topic,
            niche: source.niche,
            targetDurationSec: source.targetDurationSec,
            language: source.language,
            // The look carries over so the series reads as one body of work.
            aspectRatio: source.aspectRatio,
            voiceId: source.voiceId,
            musicTrackId: source.musicTrackId,
            musicVolume: source.musicVolume,
            captionStyle: source.captionStyle ?? Prisma.DbNull,
            backgroundStyle: source.backgroundStyle ?? Prisma.DbNull,
            status: "SCRIPTED",
            seriesId,
            episodeNumber: index + 1,
            episodeTotal: result.episodes.length,
          },
        });

        const created_script = await tx.script.create({
          data: {
            projectId: project.id,
            userId: user.id,
            version: 1,
            title,
            hook: episode.script.hook,
            alternativeHooks: episode.script.alternativeHooks,
            scenes: episode.script.scenes.map((s) => ({ id: nanoid(8), ...s })),
            callToAction: episode.script.callToAction,
            fullText: episode.fullText,
            hashtags: episode.script.hashtags,
            socialCopy: episode.script.socialCopy,
            viralityScore: episode.script.scores.virality,
            hookScore: episode.script.scores.hook,
            retentionScore: episode.script.scores.retention,
            clarityScore: episode.script.scores.clarity,
            scoreRationale: episode.script.scores.rationale,
            estimatedDurationSec: episode.estimatedDurationSec,
            wordCount: episode.wordCount,
            model: result.model,
            inputTokens: index === 0 ? result.inputTokens : 0,
            outputTokens: index === 0 ? result.outputTokens : 0,
          },
        });

        await tx.project.update({ where: { id: project.id }, data: { activeScriptId: created_script.id } });
        created.push({
          projectId: project.id,
          scriptId: created_script.id,
          title,
          episodeNumber: index + 1,
          viralityScore: created_script.viralityScore,
        });
      }
      return created;
    });

    revalidatePath("/projects");
    revalidatePath("/scripts");
    return { seriesTitle: result.seriesTitle, episodes, creditsLeft };
  });
}
