import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { isOwnImage, readOwnImage, storeGeneratedImage } from "@/lib/ai/images";
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

/** Most images one sheet is built from: one per character (or group), side by side. */
export const MAX_CHARACTER_IMAGES = 4;

/** Height of each image on a built sheet: enough for faces and outfits to read, small enough to send with every image. */
const CELL_HEIGHT = 1024;
const GAP = 48;

/**
 * The single sheet the image model and the cast reader get, from the images
 * a space or project was given: the image itself when there is one, else all
 * of them side by side on white, in order, stored as one image. One image
 * keeps every path that sends the sheet — Gemini, GPT Image, « Copier la
 * description » — exactly as it was, and a lineup of several characters is
 * what a character sheet already is (the image prompt's CAST_NOTE says never
 * to copy the lineup itself).
 */
export async function composeSheet(urls: string[], userId: string): Promise<string | null> {
  if (urls.length <= 1) return urls[0] ?? null;
  const images = await Promise.all(urls.map((url) => readOwnImage(url, userId)));
  const cells = await Promise.all(
    images.map(async (image) => {
      if (!image) throw new Error("Une des images de référence ne peut plus être lue : retire-la puis ajoute-la à nouveau.");
      const { data, info } = await sharp(image.data).flatten({ background: "#ffffff" }).resize({ height: CELL_HEIGHT, width: CELL_HEIGHT * 2, fit: "inside" }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height };
    }),
  );
  const width = cells.reduce((sum, c) => sum + c.width, 0) + GAP * (cells.length + 1);
  const height = CELL_HEIGHT + GAP * 2;
  let left = GAP;
  const layers = cells.map((c) => {
    const layer = { input: c.data, left, top: GAP + Math.round((CELL_HEIGHT - c.height) / 2) };
    left += c.width + GAP;
    return layer;
  });
  const sheet = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite(layers).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  return storeGeneratedImage(userId, { data: sheet, mimeType: "image/jpeg" }, "carousel");
}

/**
 * What a space or project stores for a new list of character images: the
 * list, the sheet built from it, and that sheet in words for the writers.
 */
export async function characterFields(urls: string[] | null, userId: string): Promise<{ characterImages: string[]; characterImage: string | null; characterSheetText: string | null }> {
  const list = [...new Set((urls ?? []).filter(Boolean))].slice(0, MAX_CHARACTER_IMAGES);
  for (const url of list) await assertCharacterSheet(url, userId);
  const sheet = await composeSheet(list, userId);
  return { characterImages: list, characterImage: sheet, characterSheetText: await sheetText(sheet, userId) };
}

/** The images a space or project shows in its block: its list, or the one sheet saved before there could be several. */
export function characterList(row: { characterImages?: string[] | null; characterImage: string | null }): string[] {
  return row.characterImages?.length ? row.characterImages : row.characterImage ? [row.characterImage] : [];
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
