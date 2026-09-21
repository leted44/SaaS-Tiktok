import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete an uploaded asset — the DB record and, when known, the stored file. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset || asset.userId !== session.user.id) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  await prisma.asset.delete({ where: { id } });
  if (asset.storageKey) {
    // Best-effort: the DB record is what the app actually relies on, and a
    // stray object left in storage is harmless. Losing the ability to remove
    // it because storage briefly errored is not an acceptable trade.
    await deleteObject(asset.storageKey).catch((err) => console.error(`[assets] failed to delete ${asset.storageKey}:`, err));
  }
  return NextResponse.json({ ok: true });
}
