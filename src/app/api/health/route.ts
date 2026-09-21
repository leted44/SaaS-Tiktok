import { NextResponse } from "next/server";
import { env, integrations } from "@/lib/env";
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
    // Which storage a deployment is actually writing to. None of this is
    // secret, and without it a failed upload is indistinguishable between
    // "wrong bucket name", "provider is not AWS" and "this build predates the
    // fix" — all three of which look like the same opaque error in the UI.
    storage: {
      driver: env.storageDriver,
      bucket: env.s3.bucket,
      endpoint: env.s3.endpoint || "aws",
      publicUrl: env.s3.publicUrl || null,
      directUpload: true,
    },
    appUrl: env.appUrl,
    time: new Date().toISOString(),
  });
}
