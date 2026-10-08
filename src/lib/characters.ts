import { prisma } from "@/lib/prisma";
import { isOwnImage, readOwnImage } from "@/lib/ai/images";
import type { GeneratedImage } from "@/lib/ai/image-generator";
import { describeCharacterSheet } from "@/lib/ai/cast-reader";
import { readClone, readyClone } from "@/lib/ai/clone";
import type { CastImage } from "@/lib/ai/image-types";

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

/**
 * The sheet's bytes, ready to hand to the image model, or null when the
 * project has none (or it can no longer be read). A space with a trained
 * clone (lib/ai/clone) and no sheet of the project's own hands over one of
 * the creator's photos carrying the clone: the image generator then draws
 * with it (lib/ai/image-generator).
 */
export async function projectCast(projectId: string, userId: string): Promise<CastImage | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { characterImage: true, space: { select: { characterImage: true, clone: true } } } });
  if (!project) return null;
  const clone = project.characterImage ? null : readyClone(project.space?.clone);
  if (clone) {
    const photo = readClone(project.space?.clone)?.photoUrl;
    const image = photo ? await readOwnImage(photo, userId) : null;
    return { data: image?.data ?? Buffer.alloc(0), mimeType: image?.mimeType ?? "image/jpeg", clone };
  }
  const url = characterImageUrl(project);
  return url ? readOwnImage(url, userId) : null;
}

/**
 * What the writers are told about a space drawn with the creator's clone. A
 * model trained on one face draws it twice, or warps the body, in poses seen
 * from the floor, lying down or foreshortened: those stay for real photos.
 */
const CLONE_CAST_NOTE =
  "The recurring person is the creator himself, drawn by an image model trained on his face. Describe him in every image brief exactly as the series bible does. Keep him in simple, natural, clearly readable poses: standing, sitting, walking, at a table, holding a plate, at a bar — seen from the front or three-quarter view, at eye or chest height, his whole head and body in frame once. Never show him lying down, upside down, seen from floor level or in strong foreshortening; when a movement on the floor matters to the line, show the setting, the equipment or the result instead, with him standing beside it.";

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
  const space = await prisma.space.findFirst({ where: { id: sid, userId }, select: { id: true, characterImage: true, characterSheetText: true, clone: true } });
  // A trained clone draws the creator's own face (lib/ai/clone): the writers are told to keep that person in poses it draws well.
  if (readyClone(space?.clone)) return CLONE_CAST_NOTE;
  if (!space?.characterImage) return null;
  if (space.characterSheetText) return space.characterSheetText;
  const text = await sheetText(space.characterImage, userId);
  if (text) await prisma.space.update({ where: { id: space.id }, data: { characterSheetText: text } });
  return text;
}
