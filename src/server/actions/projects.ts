"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/server/queries";
import { createProjectSchema, projectEditorStateSchema, scriptEditSchema, scenesSchema, parseJson } from "@/lib/validations";
import { PLANS } from "@/lib/plans";
import { guard, type ActionResult } from "@/server/action-result";
import { assembleFullText, heuristicScores } from "@/lib/ai/script-generator";
import { countWords } from "@/lib/utils";

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const user = await requireUser();
    const data = createProjectSchema.parse(input);
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const limit = PLANS[dbUser.plan].maxProjects;
    if (limit > 0) {
      const count = await prisma.project.count({ where: { userId: user.id } });
      if (count >= limit) throw new Error(`Your ${PLANS[dbUser.plan].name} plan allows ${limit} projects. Upgrade to create more.`);
    }
    const workspace = await getCurrentWorkspace();
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        title: data.title,
        topic: data.topic,
        niche: data.niche,
        aspectRatio: data.aspectRatio,
        targetDurationSec: data.targetDurationSec,
        voiceId: workspace.defaultVoiceId,
        musicTrackId: workspace.defaultMusicId,
        language: workspace.defaultLanguage,
      },
    });
    revalidatePath("/projects");
    return { id: project.id };
  });
}

export async function deleteProject(projectId: string): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    await prisma.project.delete({ where: { id: projectId, userId: user.id } });
    revalidatePath("/projects");
    return undefined;
  });
}

export async function createProjectAndRedirect(formData: FormData) {
  const result = await createProject({
    title: String(formData.get("title") ?? "Untitled video"),
    topic: String(formData.get("topic") ?? ""),
    niche: String(formData.get("niche") ?? ""),
    aspectRatio: (formData.get("aspectRatio") as "VERTICAL") ?? "VERTICAL",
    targetDurationSec: Number(formData.get("targetDurationSec") ?? 45),
  });
  if (!result.ok) throw new Error(result.error);
  redirect(`/studio/${result.data.id}`);
}

export async function saveEditorState(projectId: string, input: unknown): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const state = projectEditorStateSchema.parse(input);
    await prisma.project.update({
      where: { id: projectId, userId: user.id },
      data: {
        captionStyle: state.captionStyle,
        visualLayers: state.visualLayers,
        backgroundStyle: state.backgroundStyle,
        musicTrackId: state.musicTrackId,
        musicVolume: state.musicVolume,
        voiceId: state.voiceId,
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
        scenes,
        callToAction: edits.callToAction,
        fullText,
        hashtags: edits.hashtags,
        alternativeHooks: original.alternativeHooks,
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
