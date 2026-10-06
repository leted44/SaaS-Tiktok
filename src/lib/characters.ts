import { prisma } from "@/lib/prisma";
import { isOwnImage, readOwnImage } from "@/lib/ai/images";
import type { GeneratedImage } from "@/lib/ai/image-generator";

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
