import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runWorkerTick } from "@/lib/render/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron / scheduler entry point. Processes one render job and due scheduled posts.
 * Protect with CRON_SECRET (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`).
 * For sustained throughput run the dedicated worker (`npm run worker`) instead.
 */
export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!env.cronSecret || !safeEqual(token, env.cronSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runWorkerTick(`api-${process.pid}`);
  return NextResponse.json({ ok: true, ...result });
}
