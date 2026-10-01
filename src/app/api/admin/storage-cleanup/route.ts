import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/plans";
import { cleanStorage } from "@/lib/storage-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function admin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  return user && isAdmin(user.role) ? user : null;
}

function failure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
}

/** Admin: what the storage cleanup would remove now, without removing anything, and how its last daily run went. */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  try {
    const [report, last] = await Promise.all([cleanStorage({ dryRun: true }), prisma.workerHeartbeat.findUnique({ where: { id: "storage-cleanup" } })]);
    return NextResponse.json({ report, lastRun: last && last.tickAt.getTime() > 0 ? { at: last.tickAt.toISOString(), note: last.error } : null });
  } catch (err) {
    return failure(err);
  }
}

/** Admin: run the cleanup now, past the "more than half of all files" hold the daily run observes. */
export async function POST() {
  if (!(await admin())) return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  try {
    return NextResponse.json({ report: await cleanStorage({ force: true, budgetMs: 45_000 }) });
  } catch (err) {
    return failure(err);
  }
}
