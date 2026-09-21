import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canPresignUploads, presignPut, headObject, publicUrl, storageKey } from "@/lib/storage";
import { assetTypeFor, baseMimeType, MAX_ASSET_BYTES } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the browser a signed URL so it can upload straight to the bucket, then
 * records the asset once the object is actually there.
 *
 * The proxied route next door stays for local development, where there is no
 * bucket to sign against; in production it cannot carry a video at all, since
 * a Vercel function rejects any request body over 4.5 MB.
 *
 * POST  → { uploadUrl, key } to PUT the file to
 * PATCH → confirms that key landed and creates the Asset row
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canPresignUploads()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { name?: string; contentType?: string; size?: number; kind?: string } | null;
  if (!body?.name || !body.contentType) return NextResponse.json({ error: "Fichier invalide" }, { status: 400 });
  if (typeof body.size !== "number" || body.size <= 0) return NextResponse.json({ error: "Fichier invalide" }, { status: 400 });
  if (body.size > MAX_ASSET_BYTES) return NextResponse.json({ error: "Le fichier dépasse 50 Mo" }, { status: 413 });
  if (!assetTypeFor(body.contentType, String(body.kind ?? "asset"))) {
    return NextResponse.json({ error: `Type de fichier non pris en charge : ${body.contentType}` }, { status: 415 });
  }

  // The key embeds the user id, so a signature can only ever write into the
  // signer's own prefix even if the client tampers with what it sends back.
  const key = storageKey(session.user.id, "asset", body.name);
  const uploadUrl = await presignPut(key, baseMimeType(body.contentType));
  return NextResponse.json({ uploadUrl, key, contentType: baseMimeType(body.contentType) });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canPresignUploads()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 501 });

  const body = (await req.json().catch(() => null)) as { key?: string; name?: string; contentType?: string; kind?: string } | null;
  if (!body?.key || !body.name || !body.contentType) return NextResponse.json({ error: "Requête incomplète" }, { status: 400 });
  // Re-derive ownership from the key rather than trusting the caller: keys are
  // `asset/<userId>/<timestamp>-<name>`.
  if (!body.key.startsWith(`asset/${session.user.id}/`)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = assetTypeFor(body.contentType, String(body.kind ?? "asset"));
  if (!type) return NextResponse.json({ error: `Type de fichier non pris en charge : ${body.contentType}` }, { status: 415 });

  const head = await headObject(body.key);
  if (!head) return NextResponse.json({ error: "L'envoi ne s'est pas terminé — réessayez." }, { status: 409 });
  if (head.sizeBytes > MAX_ASSET_BYTES) return NextResponse.json({ error: "Le fichier dépasse 50 Mo" }, { status: 413 });

  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: session.user.id }, orderBy: { createdAt: "asc" } });
  const asset = await prisma.asset.create({
    data: {
      workspaceId: workspace.id,
      userId: session.user.id,
      type,
      name: body.name,
      url: publicUrl(body.key),
      storageKey: body.key,
      mimeType: baseMimeType(body.contentType),
      sizeBytes: head.sizeBytes,
    },
  });
  return NextResponse.json({ asset });
}
