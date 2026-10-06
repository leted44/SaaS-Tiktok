import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VideoCoverView } from "@/components/studio/video-cover";
import { loadCarouselFonts } from "@/lib/carousel/fonts";
import { luminance } from "@/lib/carousel/templates";
import { slideImageSrc } from "@/lib/ai/images";
import { COVER_POSITIONS, COVER_SIZE, COVER_TITLE_MAX, coverFileName, type CoverPosition } from "@/lib/video-cover";

// Reads the bundled font files from disk.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The accent when the account's own is too dark to read over an image. */
const FALLBACK_ACCENT = "#FFD23F";

/**
 * The video's cover (lib/video-cover), as the PNG that gets downloaded.
 *
 * Everything it is drawn from is in the URL — the image, the title, its
 * coloured word and its position — so the preview and the download are the
 * same request, and a given URL is always the same picture.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { title: true, workspace: { select: { accentColor: true } } },
  });
  if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

  const query = new URL(req.url).searchParams;
  const title = (query.get("title") ?? "").trim().slice(0, COVER_TITLE_MAX);
  const emphasis = (query.get("em") ?? "").trim().slice(0, 40);
  const position: CoverPosition = (COVER_POSITIONS as readonly string[]).includes(query.get("pos") ?? "") ? (query.get("pos") as CoverPosition) : "bottom";
  // Read from storage, not fetched from the public URL: see slideImageSrc.
  const imageSrc = await slideImageSrc(query.get("img"), session.user.id);
  const accent = luminance(project.workspace.accentColor) > 0.25 ? project.workspace.accentColor : FALLBACK_ACCENT;

  const fonts = await loadCarouselFonts();
  return new ImageResponse(<VideoCoverView imageSrc={imageSrc} title={title} emphasis={emphasis} position={position} accent={accent} />, {
    ...COVER_SIZE,
    fonts,
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      ...(query.has("download") ? { "Content-Disposition": `attachment; filename="${coverFileName(project.title)}"` } : {}),
    },
  });
}
