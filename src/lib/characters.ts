import { prisma } from "@/lib/prisma";
import { isOwnImage, readOwnImage } from "@/lib/ai/images";
import type { GeneratedImage } from "@/lib/ai/image-generator";
import { describeCharacterSheet } from "@/lib/ai/cast-reader";

/**
 * The character sheet ("Image de référence") a project's AI images are drawn
 * with: the project's own when it has one, else its space's. Every image of
 * the account then gets the same recurring characters — the series' first
 * image only keeps one post consistent, never two posts with each other.
 */
export function characterImageUrl(project: { characterImage: string | null; space?: { characterImage: string | null } | null }): string | null {
  return project.characterImage ?? project.space?.characterImage ?? null;
}

/** Refuse a sheet that is not the user's own stored image, or that the image pipeline could not read (JPEG or PNG only). */
export async function assertCharacterSheet(url: string, userId: string): Promise<void> {
  if (!isOwnImage(url, userId) || !(await readOwnImage(url, userId))) {
    throw new Error("Cette image ne peut pas servir de référence : envoie un JPEG ou un PNG de moins de 10 Mo.");
  }
}

/** The sheet's bytes, ready to hand to the image model, or null when the project has none (or it can no longer be read). */
export async function projectCast(projectId: string, userId: string): Promise<GeneratedImage | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { characterImage: true, space: { select: { characterImage: true } } } });
  const url = project ? characterImageUrl(project) : null;
  return url ? readOwnImage(url, userId) : null;
}

/** A newly saved sheet put into words for the writers (lib/ai/cast-reader); null when cleared or unreadable. */
export async function sheetText(url: string | null, userId: string): Promise<string | null> {
  if (!url) return null;
  const image = await readOwnImage(url, userId);
  return image ? describeCharacterSheet(image) : null;
}

/**
 * The words the writers get for the characters a post will be drawn with —
 * the same sheet projectCast() hands the image model: the project's own when
 * it has one, else its space's.
 */
export async function castTextFor(userId: string, projectId: string | null | undefined, spaceId: string | null | undefined): Promise<string | null> {
  const project = projectId ? await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true, characterImage: true, characterSheetText: true, spaceId: true } }) : null;
  if (project?.characterImage) {
    if (project.characterSheetText) return project.characterSheetText;
    // A sheet saved before sheets were put into words: read it now, once.
    const text = await sheetText(project.characterImage, userId);
    if (text) await prisma.project.update({ where: { id: project.id }, data: { characterSheetText: text } });
    return text;
  }
  const sid = project?.spaceId ?? spaceId;
  if (!sid) return null;
  const space = await prisma.space.findFirst({ where: { id: sid, userId }, select: { id: true, characterImage: true, characterSheetText: true } });
  if (!space?.characterImage) return null;
  if (space.characterSheetText) return space.characterSheetText;
  const text = await sheetText(space.characterImage, userId);
  if (text) await prisma.space.update({ where: { id: space.id }, data: { characterSheetText: text } });
  return text;
}
