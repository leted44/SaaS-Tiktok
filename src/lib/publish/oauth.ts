import { SocialPlatform } from "@prisma/client";
import { env } from "@/lib/env";
import { encrypt, decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface PlatformProfile {
  platformUserId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

const SCOPES: Record<SocialPlatform, string[]> = {
  TIKTOK: ["user.info.basic", "video.publish", "video.upload"],
  YOUTUBE: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
  INSTAGRAM: ["instagram_business_basic", "instagram_business_content_publish"],
};

export function redirectUri(platform: SocialPlatform) {
  return `${env.appUrl}/api/social/${platform.toLowerCase()}/callback`;
}

/** Build the provider authorization URL. `state` must be verified in the callback. */
export function authorizationUrl(platform: SocialPlatform, state: string, codeVerifier?: string): string {
  switch (platform) {
    case "TIKTOK": {
      const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
      url.searchParams.set("client_key", env.social.tiktok.clientKey);
      url.searchParams.set("scope", SCOPES.TIKTOK.join(","));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", redirectUri(platform));
      url.searchParams.set("state", state);
      if (codeVerifier) {
        url.searchParams.set("code_challenge", codeVerifier);
        url.searchParams.set("code_challenge_method", "plain");
      }
      return url.toString();
    }
    case "YOUTUBE": {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", env.social.youtube.clientId);
      url.searchParams.set("redirect_uri", redirectUri(platform));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", SCOPES.YOUTUBE.join(" "));
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", state);
      return url.toString();
    }
    case "INSTAGRAM": {
      const url = new URL("https://www.instagram.com/oauth/authorize");
      url.searchParams.set("client_id", env.social.instagram.appId);
      url.searchParams.set("redirect_uri", redirectUri(platform));
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", SCOPES.INSTAGRAM.join(","));
      url.searchParams.set("state", state);
      return url.toString();
    }
  }
}

export async function exchangeCode(platform: SocialPlatform, code: string, codeVerifier?: string): Promise<OAuthTokens> {
  switch (platform) {
    case "TIKTOK": {
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: env.social.tiktok.clientKey,
          client_secret: env.social.tiktok.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri(platform),
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(`Échec de l'échange de jeton TikTok : ${data.error_description ?? data.error ?? res.status}`);
      return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(Date.now() + data.expires_in * 1000), scopes: String(data.scope ?? "").split(",") };
    }
    case "YOUTUBE": {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.social.youtube.clientId,
          client_secret: env.social.youtube.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri(platform),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Échec de l'échange de jeton Google : ${data.error_description ?? data.error ?? res.status}`);
      return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(Date.now() + data.expires_in * 1000), scopes: String(data.scope ?? "").split(" ") };
    }
    case "INSTAGRAM": {
      const res = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: env.social.instagram.appId,
          client_secret: env.social.instagram.appSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri(platform),
          code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Échec de l'échange de jeton Instagram : ${data.error_message ?? res.status}`);
      // Exchange the short-lived token for a 60-day token.
      const longRes = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${env.social.instagram.appSecret}&access_token=${data.access_token}`);
      const long = await longRes.json();
      const accessToken = long.access_token ?? data.access_token;
      const expiresIn = long.expires_in ?? 3600;
      return { accessToken, expiresAt: new Date(Date.now() + expiresIn * 1000), scopes: SCOPES.INSTAGRAM };
    }
  }
}

export async function fetchProfile(platform: SocialPlatform, accessToken: string): Promise<PlatformProfile> {
  switch (platform) {
    case "TIKTOK": {
      const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username", { headers: { authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      const u = data?.data?.user;
      if (!u) throw new Error("Impossible de charger le profil TikTok");
      return { platformUserId: u.open_id, username: u.username ?? u.display_name, displayName: u.display_name, avatarUrl: u.avatar_url };
    }
    case "YOUTUBE": {
      const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      const ch = data?.items?.[0];
      if (!ch) throw new Error("Aucune chaîne YouTube trouvée pour ce compte Google");
      return { platformUserId: ch.id, username: ch.snippet.customUrl ?? ch.snippet.title, displayName: ch.snippet.title, avatarUrl: ch.snippet.thumbnails?.default?.url };
    }
    case "INSTAGRAM": {
      const res = await fetch(`https://graph.instagram.com/me?fields=id,username,name,profile_picture_url&access_token=${accessToken}`);
      const data = await res.json();
      if (!data?.id) throw new Error("Impossible de charger le profil Instagram");
      return { platformUserId: data.id, username: data.username, displayName: data.name, avatarUrl: data.profile_picture_url };
    }
  }
}

export async function refreshTokens(platform: SocialPlatform, refreshToken: string): Promise<OAuthTokens | null> {
  if (platform === "TIKTOK") {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: env.social.tiktok.clientKey, client_secret: env.social.tiktok.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return null;
    return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken, expiresAt: new Date(Date.now() + data.expires_in * 1000), scopes: String(data.scope ?? "").split(",") };
  }
  if (platform === "YOUTUBE") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.social.youtube.clientId, client_secret: env.social.youtube.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return null;
    return { accessToken: data.access_token, refreshToken, expiresAt: new Date(Date.now() + data.expires_in * 1000), scopes: String(data.scope ?? "").split(" ") };
  }
  if (platform === "INSTAGRAM") {
    const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}`);
    const data = await res.json();
    if (!res.ok || !data.access_token) return null;
    return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000), scopes: SCOPES.INSTAGRAM };
  }
  return null;
}

/** Return a valid access token for the account, refreshing (and persisting) when close to expiry. */
export async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  const expiringSoon = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000 : false;
  if (!expiringSoon) return decrypt(account.accessToken);

  // Instagram long-lived tokens refresh with the access token itself.
  const refreshSource = account.platform === "INSTAGRAM" ? account.accessToken : account.refreshToken;
  if (!refreshSource) throw new Error(`Le jeton ${account.platform} a expiré. Reconnectez le compte.`);
  const fresh = await refreshTokens(account.platform, decrypt(refreshSource));
  if (!fresh) throw new Error(`Le renouvellement du jeton ${account.platform} a échoué. Reconnectez le compte.`);
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: { accessToken: encrypt(fresh.accessToken), refreshToken: fresh.refreshToken ? encrypt(fresh.refreshToken) : account.refreshToken, tokenExpiresAt: fresh.expiresAt ?? null },
  });
  return fresh.accessToken;
}

export async function upsertSocialAccount(userId: string, workspaceId: string, platform: SocialPlatform, tokens: OAuthTokens, profile: PlatformProfile) {
  return prisma.socialAccount.upsert({
    where: { workspaceId_platform_platformUserId: { workspaceId, platform, platformUserId: profile.platformUserId } },
    create: {
      userId,
      workspaceId,
      platform,
      platformUserId: profile.platformUserId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
    },
    update: {
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
      tokenExpiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
    },
  });
}
