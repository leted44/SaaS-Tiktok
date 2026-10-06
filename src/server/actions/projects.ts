"use server";

import { DEFAULT_DURATION_SEC } from "@/lib/scripts/options";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/server/queries";
import { createProjectSchema, projectEditorStateSchema, scriptEditSchema, scenesSchema, parseJson } from "@/lib/validations";
import { effectivePlanDef } from "@/lib/plans";
import { guard, type ActionResult } from "@/server/action-result";
import { assembleFullText, heuristicScores } from "@/lib/ai/script-generator";
import { countWords } from "@/lib/utils";
import { POST_PLATFORMS } from "@/lib/projects/progress";
import { deleteUnusedKeys, keysIn } from "@/lib/storage-cleanup";
import { assertCharacterSheet, sheetText } from "@/lib/characters";

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const user = await requireUser();
    const data = createProjectSchema.parse(input);
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const planDef = effectivePlanDef(dbUser);
    if (planDef.maxProjects > 0) {
      const count = await prisma.project.count({ where: { userId: user.id } });
      if (count >= planDef.maxProjects) throw new Error(`Votre forfait ${planDef.name} autorise ${planDef.maxProjects} projets. Passez à un forfait supérieur pour en créer davantage.`);
    }
    const workspace = await getCurrentWorkspace();
    const space = data.spaceId ? await prisma.space.findFirst({ where: { id: data.spaceId, userId: user.id } }) : null;
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        spaceId: space?.id ?? null,
        title: data.title,
        topic: data.topic,
        niche: data.niche,
        aspectRatio: data.aspectRatio,
        targetDurationSec: data.targetDurationSec,
        voiceId: space?.voiceId ?? workspace.defaultVoiceId,
        musicTrackId: workspace.defaultMusicId,
        language: space?.language ?? workspace.defaultLanguage,
      },
    });
    revalidatePath("/projects");
    return { id: project.id };
  });
}

export async function deleteProject(projectId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    // What the project's files are, read before the rows that name them go.
    // A render's props snapshot is left out: it names files the project used
    // to have, some of which may now belong to the library or another project.
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: {
        carousel: true,
        voiceovers: { select: { audioUrl: true } },
        renderJobs: { select: { outputUrl: true, thumbnailUrl: true } },
        videoClipJobs: { select: { imageUrl: true, resultUrl: true } },
      },
    });
    if (!project) throw new Error("Ce projet n'existe plus.");
    const keys = keysIn(project, user.id);
    await prisma.project.delete({ where: { id: projectId, userId: user.id } });
    // After the response: deleting files must never make deleting the project fail or wait.
    after(() => deleteUnusedKeys(user.id, keys).then(() => undefined, (err) => console.error(`[storage] files of deleted project ${projectId} not removed:`, err)));
    revalidatePath("/projects");
    return undefined;
  });
}

/**
 * Mark a video as posted, by hand — most are shared from the phone rather
 * than through a connected account, so the app can't see it otherwise.
 */
export async function markProjectPosted(projectId: string, platforms: string[], postedAt?: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const clean = [...new Set(platforms.filter((p): p is (typeof POST_PLATFORMS)[number] => (POST_PLATFORMS as readonly string[]).includes(p)))];
    const at = postedAt ? new Date(postedAt) : new Date();
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000) throw new Error("Date de publication invalide.");
    const { count } = await prisma.project.updateMany({ where: { id: projectId, userId: user.id }, data: { postedAt: at, postedPlatforms: clean } });
    if (!count) throw new Error("Ce projet n'existe plus.");
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return undefined;
  });
}

/** Undo a manual "posted" mark. Publications made through a connected account stay recorded. */
export async function unmarkProjectPosted(projectId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const { count } = await prisma.project.updateMany({ where: { id: projectId, userId: user.id }, data: { postedAt: null, postedPlatforms: [] } });
    if (!count) throw new Error("Ce projet n'existe plus.");
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return undefined;
  });
}

export async function createProjectAndRedirect(formData: FormData) {
  const result = await createProject({
    title: String(formData.get("title") ?? "Untitled video"),
    topic: String(formData.get("topic") ?? ""),
    niche: String(formData.get("niche") ?? ""),
    aspectRatio: (formData.get("aspectRatio") as "VERTICAL") ?? "VERTICAL",
    targetDurationSec: Number(formData.get("targetDurationSec") ?? DEFAULT_DURATION_SEC),
  });
  if (!result.ok) throw new Error(result.error);
  redirect(`/studio/${result.data.id}`);
}

export async function saveEditorState(projectId: string, input: unknown): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const state = projectEditorStateSchema.parse(input);
    // A tempo only means anything alongside the track it was measured from.
    // Dropping the music drops the grid with it, so cuts can never stay snapped
    // to a beat nothing plays any more.
    const hasMusic = Boolean(state.musicUrl || state.musicTrackId);
    await prisma.project.update({
      where: { id: projectId, userId: user.id },
      data: {
        captionStyle: state.captionStyle,
        visualLayers: state.visualLayers,
        visualPool: state.visualPool,
        backgroundStyle: state.backgroundStyle,
        musicTrackId: state.musicTrackId,
        musicUrl: state.musicUrl,
        musicName: state.musicName,
        musicVolume: state.musicVolume,
        musicStartMs: hasMusic ? state.musicStartMs : 0,
        musicBpm: hasMusic ? state.musicBpm : null,
        musicBeatOffsetMs: hasMusic ? state.musicBeatOffsetMs : null,
        beatSync: state.beatSync,
        voiceId: state.voiceId,
        visualStyle: state.visualStyle,
        visualMotif: state.visualMotif,
      },
    });
    return undefined;
  });
}

export async function renameProject(projectId: string, title: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    await prisma.project.update({ where: { id: projectId, userId: user.id }, data: { title: title.trim().slice(0, 120) || "Untitled video" } });
    revalidatePath(`/studio/${projectId}`);
    return undefined;
  });
}

/** Save manual script edits as a new version so nothing is lost. */
export async function saveScriptEdits(scriptId: string, input: unknown): Promise<ActionResult<{ scriptId: string; version: number }>> {
  return guard(async () => {
    const user = await requireUser();
    const edits = scriptEditSchema.parse(input);
    const original = await prisma.script.findFirstOrThrow({ where: { id: scriptId, userId: user.id } });
    const oldScenes = parseJson(scenesSchema, original.scenes, []);
    const scenes = edits.scenes.map((s, i) => {
      const prev = oldScenes.find((o) => o.id === s.id) ?? oldScenes[i];
      return {
        id: s.id,
        text: s.text,
        visualDescription: s.visualDescription,
        brollQuery: s.brollQuery,
        onScreenText: s.onScreenText,
        durationSec: Math.max(1, countWords(s.text) / 2.6),
        emphasis: prev?.emphasis ?? [],
      };
    });
    const fullText = assembleFullText({ hook: edits.hook, scenes, callToAction: edits.callToAction });
    const scores = heuristicScores(fullText, edits.hook);
    const latest = await prisma.script.findFirst({ where: { projectId: original.projectId }, orderBy: { version: "desc" }, select: { version: true } });
    const script = await prisma.script.create({
      data: {
        projectId: original.projectId,
        userId: user.id,
        version: (latest?.version ?? 0) + 1,
        title: edits.title,
        hook: edits.hook,
        // Editing the words keeps the hook's own image brief.
        hookVisual: original.hookVisual,
        scenes,
        callToAction: edits.callToAction,
        fullText,
        hashtags: edits.hashtags,
        socialCopy: original.socialCopy ?? Prisma.DbNull,
        alternativeHooks: original.alternativeHooks,
        carouselLength: original.carouselLength,
        viralityScore: scores.virality,
        hookScore: scores.hook,
        retentionScore: scores.retention,
        clarityScore: scores.clarity,
        scoreRationale: "Scores re-estimated locally after manual edits. Regenerate for a full AI evaluation.",
        estimatedDurationSec: Math.round(countWords(fullText) / 2.6),
        wordCount: countWords(fullText),
        model: original.model,
      },
    });
    await prisma.project.update({ where: { id: original.projectId }, data: { activeScriptId: script.id, status: "SCRIPTED" } });
    revalidatePath(`/studio/${original.projectId}`);
    return { scriptId: script.id, version: script.version };
  });
}

export async function setActiveScript(projectId: string, scriptId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    await prisma.script.findFirstOrThrow({ where: { id: scriptId, projectId, userId: user.id } });
    await prisma.project.update({ where: { id: projectId, userId: user.id }, data: { activeScriptId: scriptId } });
    revalidatePath(`/studio/${projectId}`);
    return undefined;
  });
}

/** Give a project its own character sheet, or (null) go back to its space's. */
export async function setProjectCharacterImageAction(projectId: string, url: string | null): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    if (url) await assertCharacterSheet(url, user.id);
    const { count } = await prisma.project.updateMany({ where: { id: projectId, userId: user.id }, data: { characterImage: url, characterSheetText: await sheetText(url, user.id) } });
    if (!count) throw new Error("Ce projet n'existe plus.");
    revalidatePath(`/studio/${projectId}`);
    revalidatePath(`/studio/${projectId}/carousel`);
    return undefined;
  });
}
