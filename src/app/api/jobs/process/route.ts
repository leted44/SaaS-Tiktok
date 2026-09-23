import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runWorkerTick } from "@/lib/render/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron / scheduler entry point. Advances autopilot videos, one render job and due scheduled posts.
 * Protect with CRON_SECRET, sent either as `Authorization: Bearer <CRON_SECRET>`
 * (what Vercel Cron and cron-job.org send) or `?secret=<CRON_SECRET>` — the
 * query param exists so a render can be nudged along by visiting the URL
 * directly from a phone browser, which can't set a custom header.
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
  const headerToken = auth.replace(/^Bearer\s+/i, "");
  const queryToken = new URL(req.url).searchParams.get("secret") ?? "";
  const token = headerToken || queryToken;
  if (!env.cronSecret || !safeEqual(token, env.cronSecret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Answer at once and do the work after the response. A tick that writes a
  // script or a voice-over takes longer than cron-job.org waits (30 s), which
  // it would record as a failure — and eventually disable the job. `?wait=1`
  // runs it inline and returns the result, for checking by hand.
  if (new URL(req.url).searchParams.has("wait")) {
    const result = await runWorkerTick(`api-${process.pid}`);
    return NextResponse.json({ ok: true, ...result });
  }
  after(() => runWorkerTick(`api-${process.pid}`).then(() => undefined, (err) => console.error("[worker] tick failed:", err)));
  return NextResponse.json({ ok: true, started: true });
}
