"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/auth";
import { isAdmin } from "@/lib/plans";
import { integrations } from "@/lib/env";
import { parseJson, visualLayersSchema, type VisualLayer } from "@/lib/validations";
import { sceneVisualDescriptions } from "@/lib/pipeline/visuals";
import { buildShortVideoProps } from "@/lib/render/build-props";
import { absoluteUrl } from "@/lib/storage";
import { readOwnImage } from "@/lib/ai/images";
import { characterList } from "@/lib/characters";
import { writeFilmShots } from "@/lib/ai/film-prompt";
import { FILM_MAX_ELEMENTS, planFilmShots, readProjectFilm, type FilmRequest } from "@/lib/video-clips/film";
import { guard, type ActionResult } from "@/server/action-result";

/**
 * Admin test « Film en une fois » (lib/video-clips/film): queue one Kling 3
 * generation that draws the whole silent mini-film — the hook's image as its
 * first frame, one shot per part of the script, the project's character
 * images as elements. Free of credits (admin only, paid on fal); the studio's
 * polling of /api/video-clips/[id] drives it and the worker puts the film on
 * the video once it lands, keeping the images for « Revenir aux images ».
 */
export async function startFilmAction(projectId: string): Promise<ActionResult<{ jobId: string; seconds: number; shots: number }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!isAdmin(user.role)) throw new Error("Réservé à l'admin (test).");
    if (!integrations.videoClips()) throw new Error("La génération vidéo n'est pas configurée (clé FAL_API_KEY manquante).");

    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, include: { workspace: true, space: { select: { characterImage: true, characterImages: true } } } });
    const script = project.activeScriptId ? await prisma.script.findFirst({ where: { id: project.activeScriptId, projectId } }) : null;
    if (!script?.story || script.storyNarrated) throw new Error("Le film en une fois se fait sur un mini-film sans voix.");
    const running = await prisma.videoClipJob.findFirst({ where: { projectId, tier: "film", status: { in: ["QUEUED", "PROCESSING"] } }, select: { id: true } });
    if (running) throw new Error("Un film est déjà en cours pour cette vidéo.");

    // The script's own timing, not a film already on: the new film is cut from the script.
    const props = buildShortVideoProps({ project: { ...project, film: null }, script, voiceover: null, workspace: project.workspace, resolution: "1080p", watermark: false, snapCuts: false });
    const seconds = planFilmShots(props.scenes.map((s) => s.endMs - s.startMs));

    // The first frame: the hook's image — from before the film when one is on.
    const layers: VisualLayer[] = readProjectFilm(project.film)?.previousLayers ?? parseJson(visualLayersSchema, project.visualLayers, []);
    const hook = layers.find((l) => l.sceneIndex === 0 && l.type === "image" && l.src);
    if (!hook?.src) throw new Error("Crée d'abord l'image de l'accroche (Hook) : c'est la première image du film.");
    const start = await readOwnImage(hook.src, user.id);
    if (!start) throw new Error("L'image de l'accroche ne peut pas être lue : refais-la ou importe-la à nouveau.");

    const elementUrls = (project.characterImages.length || project.characterImage ? characterList(project) : project.space ? characterList(project.space) : []).slice(0, FILM_MAX_ELEMENTS);
    const elementImages = (await Promise.all(elementUrls.map((u) => readOwnImage(u, user.id)))).filter((i): i is NonNullable<typeof i> => Boolean(i));

    const briefs = sceneVisualDescriptions(props.scenes.length, script);
    const shotInputs = seconds.map((durationSec, i) => ({
      durationSec,
      // The last shot also carries the closing line.
      caption: i === seconds.length - 1 ? `${props.scenes[i]?.text ?? ""} ${props.scenes[i + 1]?.text ?? ""}` : (props.scenes[i]?.text ?? ""),
      brief: briefs[i] ?? "",
    }));
    const written = await writeFilmShots(start, elementImages, shotInputs, project.visualMotif ?? "", project.topic ?? script.title);
    const request: FilmRequest = {
      shots: seconds.map((duration, i) => ({ duration, prompt: (written?.[i] ?? (shotInputs[i].brief || shotInputs[i].caption || "The characters act out the scene.")).slice(0, 2500) })),
      elements: elementUrls.slice(0, elementImages.length).map((u) => absoluteUrl(u)),
    };

    const job = await prisma.videoClipJob.create({
      data: { projectId, userId: user.id, layerId: "film", imageUrl: absoluteUrl(hook.src), prompt: JSON.stringify(request), tier: "film", duration: String(seconds.reduce((a, b) => a + b, 0)), creditsCharged: 0 },
    });
    revalidatePath(`/studio/${projectId}`);
    return { jobId: job.id, seconds: seconds.reduce((a, b) => a + b, 0), shots: seconds.length };
  });
}

/** « Revenir aux images »: the visuals the film replaced go back on the video, the film is set aside. */
export async function clearFilmAction(projectId: string): Promise<ActionResult<{ layers: VisualLayer[] }>> {
  return guard(async () => {
    const user = await requireDbUser();
    if (!isAdmin(user.role)) throw new Error("Réservé à l'admin (test).");
    const project = await prisma.project.findFirstOrThrow({ where: { id: projectId, userId: user.id }, select: { film: true } });
    const film = readProjectFilm(project.film);
    if (!film) throw new Error("Aucun film sur cette vidéo.");
    await prisma.project.update({ where: { id: projectId }, data: { visualLayers: film.previousLayers, film: Prisma.DbNull } });
    revalidatePath(`/studio/${projectId}`);
    return { layers: film.previousLayers };
  });
}
