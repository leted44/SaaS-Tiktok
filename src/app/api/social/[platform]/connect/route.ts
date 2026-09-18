import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { authorizationUrl } from "@/lib/publish/oauth";
import { randomToken } from "@/lib/crypto";
import { integrations, env } from "@/lib/env";
import type { SocialPlatform } from "@prisma/client";

export const dynamic = "force-dynamic";

const PLATFORMS: Record<string, SocialPlatform> = { tiktok: "TIKTOK", youtube: "YOUTUBE", instagram: "INSTAGRAM" };

export async function GET(_req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${env.appUrl}/sign-in`);
  const { platform: raw } = await ctx.params;
  const platform = PLATFORMS[raw];
  if (!platform) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  const configured = platform === "TIKTOK" ? integrations.tiktok() : platform === "YOUTUBE" ? integrations.youtube() : integrations.instagram();
  if (!configured) return NextResponse.redirect(`${env.appUrl}/exports?error=${encodeURIComponent(`${raw} publishing is not configured on this server.`)}`);

  const state = randomToken();
  const verifier = platform === "TIKTOK" ? randomToken(32) : undefined;
  const jar = await cookies();
  jar.set(`oauth_state_${raw}`, JSON.stringify({ state, verifier }), { httpOnly: true, secure: env.isProd, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authorizationUrl(platform, state, verifier));
}
