import { NextResponse } from "next/server";
import { integrations } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }
  return NextResponse.json({
    status: database === "ok" ? "ok" : "degraded",
    database,
    integrations: { ai: integrations.ai(), tts: integrations.tts(), stripe: integrations.stripe(), s3: integrations.s3(), tiktok: integrations.tiktok(), youtube: integrations.youtube(), instagram: integrations.instagram() },
    time: new Date().toISOString(),
  });
}
