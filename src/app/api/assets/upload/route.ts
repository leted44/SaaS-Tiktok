import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putObject, storageKey } from "@/lib/storage";
import type { AssetType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED: Record<string, AssetType> = {
  "image/png": "IMAGE",
  "image/jpeg": "IMAGE",
  "image/webp": "IMAGE",
  "image/gif": "IMAGE",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "video/quicktime": "VIDEO",
  "audio/mpeg": "AUDIO",
  "audio/wav": "AUDIO",
  "audio/x-wav": "AUDIO",
};

/** Multipart upload for b-roll, logos, watermarks and music. Returns the stored asset. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "asset");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Le fichier dépasse 50 Mo" }, { status: 413 });
  const type = kind === "logo" ? "LOGO" : ALLOWED[file.type];
  if (!type) return NextResponse.json({ error: `Unsupported file type ${file.type}` }, { status: 415 });

  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: session.user.id }, orderBy: { createdAt: "asc" } });
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await putObject(storageKey(session.user.id, "asset", file.name), buffer, file.type);
  const asset = await prisma.asset.create({
    data: { workspaceId: workspace.id, userId: session.user.id, type, name: file.name, url: stored.url, storageKey: stored.key, mimeType: file.type, sizeBytes: stored.sizeBytes },
  });
  return NextResponse.json({ asset });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assets = await prisma.asset.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ assets });
}
