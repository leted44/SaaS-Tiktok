"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { backgroundStyleSchema, captionStyleSchema, parseJson } from "@/lib/validations";
import { presetStyle } from "@/lib/captions/presets";
import { carouselLookSchema, coverLookSchema, readSpaceKit, videoLookSchema, type CarouselLook, type SpaceKit, type VideoLook } from "@/lib/space-kit";
import { guard, type ActionResult } from "@/server/action-result";

/**
 * The space's look ("Rendu de l'espace", lib/space-kit): saved from one post
 * set up as the creator wants, then given to every new post of the space.
 * Nothing here calls a paid service.
 */

async function ownedSpace(userId: string, spaceId: string) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, userId }, select: { id: true, kit: true } });
  if (!space) throw new Error("Cet espace n'existe plus.");
  return space;
}

async function writeKit(spaceId: string, kit: SpaceKit, extra: Prisma.SpaceUpdateInput = {}) {
  const empty = !kit.video && !kit.carousel;
  await prisma.space.update({ where: { id: spaceId }, data: { kit: empty ? Prisma.DbNull : (kit as unknown as Prisma.InputJsonValue), ...extra } });
  revalidatePath("/spaces");
}

/**
 * Save a video's look as its space's: captions, background, music, the voice
 * (as the space's voice) and its tone, the art direction and the cover. The
 * studio saves its pending edits first, so this reads what is on screen.
 */
export async function saveVideoLookAction(projectId: string, input: { cover: unknown; voiceStability: number | null }): Promise<ActionResult<{ look: VideoLook }>> {
  return guard(async () => {
    const user = await requireUser();
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: { workspace: { select: { captionPreset: true, captionPosition: true, primaryColor: true } }, voiceovers: { orderBy: { createdAt: "desc" }, take: 1, select: { stability: true } } },
    });
    if (!project) throw new Error("Ce projet n'existe plus.");
    if (!project.spaceId) throw new Error("Range d'abord ce projet dans un espace.");
    const space = await ownedSpace(user.id, project.spaceId);
    const cover = coverLookSchema.safeParse(input.cover);
    const tone = typeof input.voiceStability === "number" && input.voiceStability >= 0 && input.voiceStability <= 1 ? input.voiceStability : null;
    const look = videoLookSchema.parse({
      captionStyle: parseJson(captionStyleSchema, project.captionStyle, presetStyle(project.workspace.captionPreset, project.workspace.captionPosition)),
      backgroundStyle: parseJson(backgroundStyleSchema, project.backgroundStyle, { type: "gradient", colors: [project.workspace.primaryColor, "#0B0714"], vignette: true, grain: true }),
      musicTrackId: project.musicTrackId,
      musicUrl: project.musicUrl,
      musicName: project.musicName,
      musicVolume: project.musicVolume,
      musicStartMs: project.musicStartMs,
      musicBpm: project.musicBpm,
      musicBeatOffsetMs: project.musicBeatOffsetMs,
      beatSync: project.beatSync,
      // The tone picked on screen, else the one the last voice-over was read with.
      voiceStability: tone ?? project.voiceovers[0]?.stability ?? null,
      visualStyle: project.visualStyle && videoLookSchema.shape.visualStyle.safeParse(project.visualStyle).success ? project.visualStyle : null,
      cover: cover.success ? cover.data : null,
      fromProjectId: project.id,
      savedAt: new Date().toISOString(),
    });
    const kit = readSpaceKit(space.kit);
    await writeKit(space.id, { ...kit, video: look }, project.voiceId ? { voiceId: project.voiceId } : {});
    return { look };
  });
}

/** Save a carousel's look as its space's: template, format, accent colour, signature and art direction. */
export async function saveCarouselLookAction(projectId: string): Promise<ActionResult<{ look: CarouselLook }>> {
  return guard(async () => {
    const user = await requireUser();
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true, spaceId: true, carousel: { select: { template: true, format: true, accent: true, handle: true, visualStyle: true } } } });
    if (!project?.carousel) throw new Error("Ce carrousel n'existe plus.");
    if (!project.spaceId) throw new Error("Range d'abord ce projet dans un espace.");
    const space = await ownedSpace(user.id, project.spaceId);
    const c = project.carousel;
    const look = carouselLookSchema.parse({
      template: c.template,
      format: c.format,
      accent: c.accent,
      handle: c.handle,
      visualStyle: c.visualStyle && carouselLookSchema.shape.visualStyle.safeParse(c.visualStyle).success ? c.visualStyle : null,
      fromProjectId: project.id,
      savedAt: new Date().toISOString(),
    });
    const kit = readSpaceKit(space.kit);
    await writeKit(space.id, { ...kit, carousel: look });
    return { look };
  });
}

/** Forget one half of a space's look (its posts keep theirs; new ones go back to the defaults). */
export async function clearSpaceLookAction(spaceId: string, part: "video" | "carousel"): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const space = await ownedSpace(user.id, spaceId);
    const kit = readSpaceKit(space.kit);
    await writeKit(space.id, { ...kit, [part]: null });
    return undefined;
  });
}

const editedLookSchema = z.object({
  voiceId: z.string().min(1).max(80).nullable(),
  video: videoLookSchema.omit({ savedAt: true, fromProjectId: true }),
  carousel: carouselLookSchema.omit({ savedAt: true, fromProjectId: true }),
});

/** The whole look, set from the space's own page (Espaces → Régler le rendu): both halves and the voice. */
export async function saveSpaceLookAction(spaceId: string, input: unknown): Promise<ActionResult<undefined>> {
  return guard(async () => {
    const user = await requireUser();
    const space = await ownedSpace(user.id, spaceId);
    const parsed = editedLookSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Réglages invalides.");
    const savedAt = new Date().toISOString();
    const { voiceId, video, carousel } = parsed.data;
    await writeKit(space.id, { video: { ...video, savedAt, fromProjectId: null }, carousel: { ...carousel, savedAt, fromProjectId: null } }, { voiceId });
    revalidatePath(`/spaces/${space.id}/rendu`);
    return undefined;
  });
}
