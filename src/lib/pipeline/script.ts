import type { User, Workspace } from "@prisma/client";
import { readSpaceKit, videoLookColumns } from "@/lib/space-kit";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { generateScript } from "@/lib/ai/script-generator";
import { chargeCredits, refundCredits } from "@/lib/credits";
import { isAdmin, CREDIT_COSTS } from "@/lib/plans";
import type { GenerateScriptInput } from "@/lib/validations";
import { activeLessons, lessonsBrief } from "@/lib/results/lessons";
import { castTextFor, characterFields } from "@/lib/characters";

export interface GeneratedScriptSummary {
  projectId: string;
  scriptId: string;
  version: number;
  viralityScore: number;
  creditsLeft: number;
  /** How many of the account's own lessons the script was written with. */
  lessonsApplied: number;
}

/**
 * Write a script for a user and attach it to a project (a new one unless
 * `data.projectId` names one of theirs). The studio's "Générer" button and the
 * autopilot both come through here, so a scheduled video is billed and stored
 * exactly like one made by hand.
 */
export async function createScript(user: Pick<User, "id" | "role" | "credits">, workspace: Workspace, data: GenerateScriptInput): Promise<GeneratedScriptSummary> {
  // Character images picked for this post: checked, joined into one sheet and put into words before
  // anything is charged, so the writer knows every character (lib/characters).
  const ownCast = data.characterImages?.length ? await characterFields(data.characterImages, user.id) : null;
  // Charge first (atomic), refund if generation fails — never let a failed call eat credits.
  const admin = isAdmin(user.role);
  const creditsLeft = admin
    ? user.credits
    : await chargeCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "SCRIPT_GENERATION", `Script : ${data.topic.slice(0, 60)}`);

  // The account the script is for: the space picked, or the one of the project it is written into.
  const targetSpaceId = data.spaceId ?? (data.projectId ? ((await prisma.project.findFirst({ where: { id: data.projectId, userId: user.id }, select: { spaceId: true } }))?.spaceId ?? null) : null);
  const [lessons, targetSpace, cast, existing] = await Promise.all([
    activeLessons(user.id, targetSpaceId, data.carouselLength ? "carousel" : "video").catch(() => []),
    targetSpaceId ? prisma.space.findFirst({ where: { id: targetSpaceId, userId: user.id }, select: { brief: true, motif: true } }) : null,
    ownCast ? ownCast.characterSheetText : castTextFor(user.id, data.projectId, targetSpaceId),
    data.projectId ? prisma.project.findFirst({ where: { id: data.projectId, userId: user.id }, select: { visualMotif: true } }) : null,
  ]);
  // The Fil conducteur the scenes are written from: one typed for this post, else the
  // project's own (a new script for an existing post keeps its world), else the space's.
  // Only with none of them does the writer invent its own.
  const typed = data.visualMotif?.trim() || null;
  const bible = typed ?? (existing?.visualMotif?.trim() || null) ?? (targetSpace?.motif?.trim() || null);
  const fromCreator = Boolean(typed || (!existing?.visualMotif?.trim() && targetSpace?.motif?.trim()));

  let result;
  try {
    result = await generateScript(data, { toneOfVoice: workspace.toneOfVoice, targetAudience: workspace.targetAudience, lessons: lessonsBrief(lessons), concept: targetSpace?.brief, cast, bible });
  } catch (err) {
    if (!admin) await refundCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Remboursement — la génération du script a échoué");
    throw err;
  }

  const space = data.spaceId ? await prisma.space.findFirst({ where: { id: data.spaceId, userId: user.id } }) : null;
  const projectId =
    data.projectId ??
    (
      await prisma.project.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          spaceId: space?.id ?? null,
          title: result.script.title,
          topic: data.topic,
          niche: data.niche,
          sourceUrl: data.sourceUrl || null,
          targetDurationSec: data.targetDurationSec,
          language: data.language,
          aspectRatio: workspace.defaultAspect,
          voiceId: space?.voiceId ?? workspace.defaultVoiceId,
          musicTrackId: workspace.defaultMusicId,
          // The space's saved look (lib/space-kit): captions, background, music, art direction.
          ...videoLookColumns(readSpaceKit(space?.kit).video),
          ...(ownCast ?? {}),
        },
      })
    ).id;
  if (ownCast && data.projectId) await prisma.project.updateMany({ where: { id: data.projectId, userId: user.id }, data: ownCast });

  const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id } });
  // A story's words are its captions: they stay on even when the space's look switched them off.
  const story = Boolean(data.story) && !data.carouselLength;
  // Only the silent version needs its captions forced on: a narrated one is captioned like any voiced video.
  const silentStory = story && !data.storyNarrated;
  const captions = project.captionStyle as Record<string, unknown> | null;
  const captionsOn = silentStory && captions && typeof captions === "object" && captions.enabled === false ? { captionStyle: { ...captions, enabled: true } } : {};
  const latest = await prisma.script.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { version: true } });

  const script = await prisma.script.create({
    data: {
      projectId,
      userId: user.id,
      version: (latest?.version ?? 0) + 1,
      title: result.script.title,
      hook: result.script.hook,
      hookVisual: result.script.hookVisualDescription?.trim() || null,
      alternativeHooks: result.script.alternativeHooks,
      coverTitles: result.script.coverTitles,
      carouselLength: data.carouselLength ?? null,
      story,
      storyNarrated: story && Boolean(data.storyNarrated),
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
      reviewReport: result.review,
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      activeScriptId: script.id,
      status: "SCRIPTED",
      topic: project.topic ?? data.topic,
      niche: project.niche ?? data.niche,
      // The cast and world the scenes' AI images share: one typed for this post wins; a motif the
      // project already has is never replaced; else the space's, word for word; else the writer's.
      visualMotif: typed ?? (project.visualMotif?.trim() ? project.visualMotif : bible ?? (result.script.visualMotif.trim().slice(0, 800) || null)),
      ...(fromCreator ? { motifFromCreator: true } : {}),
      ...captionsOn,
    },
  });

  return { projectId, scriptId: script.id, version: script.version, viralityScore: script.viralityScore, creditsLeft, lessonsApplied: lessons.length };
}
