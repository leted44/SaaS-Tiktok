import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putObject, storageKey } from "@/lib/storage";
import { assetTypeFor, baseMimeType, MAX_ASSET_BYTES } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxied upload: the file passes through this function on its way to storage.
 *
 * Kept for local development, where there is no bucket to sign an upload
 * against. In production the client uses /api/assets/direct instead — a Vercel
 * function request body is capped at 4.5 MB, which no video clears, and the
 * bytes would otherwise cross the network twice for no benefit.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "asset");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
  if (file.size > MAX_ASSET_BYTES) return NextResponse.json({ error: "Le fichier dépasse 50 Mo" }, { status: 413 });
  const type = assetTypeFor(file.type, kind);
  if (!type) return NextResponse.json({ error: `Type de fichier non pris en charge : ${file.type}` }, { status: 415 });

  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: session.user.id }, orderBy: { createdAt: "asc" } });
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await putObject(storageKey(session.user.id, "asset", file.name), buffer, file.type);
  const asset = await prisma.asset.create({
    data: { workspaceId: workspace.id, userId: session.user.id, type, name: file.name, url: stored.url, storageKey: stored.key, mimeType: baseMimeType(file.type), sizeBytes: stored.sizeBytes },
  });
  return NextResponse.json({ asset });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assets = await prisma.asset.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ assets });
}
