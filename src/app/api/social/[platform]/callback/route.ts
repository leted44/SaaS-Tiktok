import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { exchangeCode, fetchProfile, upsertSocialAccount } from "@/lib/publish/oauth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { PLANS } from "@/lib/plans";
import { safeEqual } from "@/lib/crypto";
import type { SocialPlatform } from "@prisma/client";

export const dynamic = "force-dynamic";

const PLATFORMS: Record<string, SocialPlatform> = { tiktok: "TIKTOK", youtube: "YOUTUBE", instagram: "INSTAGRAM" };

export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: raw } = await ctx.params;
  const platform = PLATFORMS[raw];
  const back = (msg: string, ok = false) => NextResponse.redirect(`${env.appUrl}/exports?${ok ? "connected" : "error"}=${encodeURIComponent(msg)}`);
  if (!platform) return back("Unknown platform");

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${env.appUrl}/sign-in`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return back(`${raw}: ${providerError}`);
  if (!code || !state) return back("Missing authorization code");

  const jar = await cookies();
  const stored = jar.get(`oauth_state_${raw}`)?.value;
  jar.delete(`oauth_state_${raw}`);
  if (!stored) return back("Session expired, please try again");
  const parsed = JSON.parse(stored) as { state: string; verifier?: string };
  if (!safeEqual(parsed.state, state)) return back("Invalid state, please try again");

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
    const limit = PLANS[user.plan].maxSocialAccounts;
    if (limit > 0) {
      const count = await prisma.socialAccount.count({ where: { workspaceId: workspace.id } });
      if (count >= limit) return back(`Your plan allows ${limit} connected account${limit > 1 ? "s" : ""}. Upgrade to connect more.`);
    }
    const tokens = await exchangeCode(platform, code, parsed.verifier);
    const profile = await fetchProfile(platform, tokens.accessToken);
    await upsertSocialAccount(user.id, workspace.id, platform, tokens, profile);
    return back(`${raw}:${profile.username}`, true);
  } catch (err) {
    return back(err instanceof Error ? err.message : "Connection failed");
  }
}
