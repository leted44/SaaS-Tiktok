import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CarouselSlideView } from "@/components/carousel/slide";
import { resolveTemplate } from "@/lib/carousel/templates";
import { loadCarouselFonts } from "@/lib/carousel/fonts";
import { renderableImageUrl } from "@/lib/carousel/images";
import { carouselStateSchema, slideFileSlug, FORMAT_SIZE } from "@/lib/carousel/schema";

// Reads the bundled font files from disk.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One slide of a carousel, as the PNG that gets posted.
 *
 * Serves both the in-app preview and the download, so the two can never
 * disagree. The URL carries the carousel's version, which changes on every
 * save — a given URL therefore always means the same image, and is cached
 * as such by the browser.
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string; index: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { projectId, index } = await params;
  const carousel = await prisma.carousel.findFirst({
    where: { projectId, userId: session.user.id },
    include: { project: { select: { title: true, workspace: { select: { primaryColor: true, accentColor: true } } } } },
  });
  if (!carousel) return NextResponse.json({ error: "Carrousel introuvable" }, { status: 404 });

  const parsed = carouselStateSchema.safeParse({ template: carousel.template, format: carousel.format, handle: carousel.handle, slides: carousel.slides });
  if (!parsed.success) return NextResponse.json({ error: "Carrousel illisible" }, { status: 422 });
  const state = parsed.data;

  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= state.slides.length) return NextResponse.json({ error: "Slide introuvable" }, { status: 404 });

  const step = state.slides.slice(0, i + 1).filter((s) => s.kind === "content").length;
  const { workspace } = carousel.project;
  const tokens = resolveTemplate(state.template, { primary: workspace.primaryColor, accent: workspace.accentColor });
  const { width, height } = FORMAT_SIZE[state.format];
  const fonts = await loadCarouselFonts();

  const download = new URL(req.url).searchParams.has("download");
  return new ImageResponse(
    <CarouselSlideView slide={state.slides[i]} index={i} total={state.slides.length} step={step} format={state.format} tokens={tokens} handle={state.handle} imageUrl={renderableImageUrl(state.slides[i].image?.url)} />,
    {
      width,
      height,
      fonts,
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        ...(download ? { "Content-Disposition": `attachment; filename="${slideFileSlug(carousel.project.title)}-slide-${String(i + 1).padStart(2, "0")}.png"` } : {}),
      },
    },
  );
}
