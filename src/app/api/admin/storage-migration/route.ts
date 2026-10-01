import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/plans";
import { copyLegacyObjects, storageMigrationInfo } from "@/lib/storage";
import { countLegacyUrls, rewriteLegacyUrls } from "@/lib/storage-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("copy"), after: z.string().max(1024).nullable() }),
  z.object({ action: z.literal("rewrite") }),
]);

async function admin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  return user && isAdmin(user.role) ? user : null;
}

/** Admin: the move from the old bucket to R2 — where it stands. */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  const info = storageMigrationInfo();
  if (!info) return NextResponse.json({ configured: false });
  try {
    return NextResponse.json({ configured: true, from: info.from, to: info.to, links: await countLegacyUrls() });
  } catch (err) {
    return failure(err);
  }
}

/**
 * Admin: one step of the move. "copy" copies a batch of files and says where
 * to resume; "rewrite" points the database at R2 — only to be run once every
 * file has been copied, or the links would lead nowhere.
 */
export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  if (!storageMigrationInfo()) return NextResponse.json({ error: "R2 n'est pas configuré" }, { status: 409 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  try {
    if (parsed.data.action === "copy") return NextResponse.json(await copyLegacyObjects(parsed.data.after, 40_000));
    const rows = await rewriteLegacyUrls();
    return NextResponse.json({ rows, links: await countLegacyUrls() });
  } catch (err) {
    return failure(err);
  }
}

function failure(err: unknown) {
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  return NextResponse.json({ error: [e.name, e.$metadata?.httpStatusCode, e.message].filter(Boolean).join(" · ").slice(0, 300) }, { status: 502 });
}
