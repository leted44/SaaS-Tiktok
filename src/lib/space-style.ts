import { prisma } from "@/lib/prisma";
import { VISUAL_STYLES, type VisualStyle } from "@/lib/carousel/art-direction";
import { readSpaceKit } from "@/lib/space-kit";

const asStyle = (value: unknown): VisualStyle | null => ((VISUAL_STYLES as readonly unknown[]).includes(value) ? (value as VisualStyle) : null);

/**
 * The art direction an account already uses: the style of the most recently
 * edited video or carousel of the same space. A new post of that space starts
 * on it instead of the app-wide default — a series drawn in "Illustration 3D"
 * kept opening its next video on "Cinématique", one tap from being generated
 * in the wrong look. Null outside a space, or before its first styled post.
 *
 * The space's saved look (lib/space-kit) comes first: the one of the post's
 * own format, then the other's.
 */
export async function spaceVisualStyle(userId: string, spaceId: string | null | undefined, format: "video" | "carousel" = "video"): Promise<VisualStyle | null> {
  if (!spaceId) return null;
  const space = await prisma.space.findFirst({ where: { id: spaceId, userId }, select: { kit: true } });
  const kit = readSpaceKit(space?.kit);
  const saved = format === "carousel" ? (kit.carousel?.visualStyle ?? kit.video?.visualStyle) : (kit.video?.visualStyle ?? kit.carousel?.visualStyle);
  if (saved) return saved;
  const [video, carousel] = await Promise.all([
    prisma.project.findFirst({ where: { userId, spaceId, visualStyle: { not: null } }, orderBy: { updatedAt: "desc" }, select: { visualStyle: true, updatedAt: true } }),
    prisma.carousel.findFirst({ where: { userId, visualStyle: { not: null }, project: { spaceId } }, orderBy: { updatedAt: "desc" }, select: { visualStyle: true, updatedAt: true } }),
  ]);
  const latest = [video, carousel].filter((r) => r !== null).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  return asStyle(latest?.visualStyle);
}

/** spaceVisualStyle() for a project, by id. */
export async function projectSpaceStyle(userId: string, projectId: string, format: "video" | "carousel" = "video"): Promise<VisualStyle | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { spaceId: true } });
  return spaceVisualStyle(userId, project?.spaceId, format);
}
