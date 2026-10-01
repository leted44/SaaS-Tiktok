import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env, integrations } from "@/lib/env";
import { isAdmin } from "@/lib/plans";
import { readObjectDetailed } from "@/lib/storage";
import { fetchOwnImage, isOwnStorageUrl, ownedAssetKey } from "@/lib/ai/images";
import { carouselStateFromRow } from "@/lib/carousel/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

/**
 * Admin diagnostic: why a carousel's images do or do not reach the slide
 * renderer. For each slide image it reports whether the URL is recognised as
 * ours, the storage key read from it, the result of reading that key from the
 * bucket, and the result of fetching the public URL — the two ways the
 * renderer gets an image. Configuration is reported as hosts and names only,
 * never credentials.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });

  const { projectId } = await params;
  const row = await prisma.carousel.findFirst({ where: { projectId, userId: user.id } });
  if (!row) return NextResponse.json({ error: "Carrousel introuvable" }, { status: 404 });
  const parsed = carouselStateFromRow(row);
  if (!parsed.success) return NextResponse.json({ error: "Carrousel illisible" }, { status: 422 });

  const slides = await Promise.all(
    parsed.data.slides.map(async (s, i) => {
      const url = s.image?.url ?? null;
      if (!url) return { slide: i + 1, kind: s.kind, image: null };
      const key = ownedAssetKey(url, user.id);
      const stored = key ? await readObjectDetailed(key) : null;
      const fetched = await fetchOwnImage(url);
      return {
        slide: i + 1,
        kind: s.kind,
        url,
        host: hostOf(url),
        recognisedHost: isOwnStorageUrl(url),
        key,
        storageRead: stored ? ("data" in stored ? { ok: true, bytes: stored.data.length } : { ok: false, error: stored.error }) : "no key in URL",
        publicFetch: "data" in fetched ? { ok: true, status: fetched.status, bytes: fetched.data.length, type: fetched.type } : { ok: false, ...fetched },
      };
    }),
  );

  return NextResponse.json({
    config: {
      storageDriver: env.storageDriver,
      s3Configured: Boolean(env.s3.accessKeyId),
      bucket: env.s3.bucket,
      endpointHost: env.s3.endpoint ? hostOf(env.s3.endpoint) : null,
      publicUrlHost: env.s3.publicUrl ? hostOf(env.s3.publicUrl) : null,
      appUrlHost: hostOf(env.appUrl),
      r2Bucket: integrations.r2() ? env.r2.bucket : null,
      r2PublicUrlHost: integrations.r2() ? hostOf(env.r2.publicUrl) : null,
    },
    slides,
  });
}
