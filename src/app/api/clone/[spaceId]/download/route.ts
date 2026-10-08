import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/plans";
import { ownedAssetKey } from "@/lib/ai/images";
import { readObject } from "@/lib/storage";
import { readClone } from "@/lib/ai/clone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The creator's trained clone as a file (lib/ai/clone) — a FLUX LoRA, to use
 * in any tool that loads them. From the app's own copy when there is one,
 * else straight from fal. Signed-in admin, own space only: the file holds
 * their face.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const { spaceId } = await params;
  const space = await prisma.space.findFirst({ where: { id: spaceId, userId: user.id }, select: { clone: true } });
  const clone = readClone(space?.clone);
  if (!clone || clone.status !== "ready" || !clone.loraUrl) return NextResponse.json({ error: "Aucun clone prêt pour cet espace." }, { status: 404 });

  const key = ownedAssetKey(clone.loraBackupUrl, user.id);
  const data = key ? await readObject(key) : null;
  if (!data) return NextResponse.redirect(clone.loraUrl);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(data.length),
      "content-disposition": `attachment; filename="mon-clone-${clone.trigger}.safetensors"`,
      "cache-control": "private, no-store",
    },
  });
}
