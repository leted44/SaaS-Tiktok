import { createECDH, hkdfSync } from "crypto";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export interface PushPayload {
  title: string;
  body: string;
  /** Path opened when the notification is tapped. */
  url: string;
  /** Notifications sharing a tag replace each other instead of piling up. */
  tag?: string;
}

let cached: { publicKey: string; privateKey: string } | null | undefined;

/**
 * The VAPID key pair that signs our pushes.
 *
 * Explicit VAPID_* variables win. Without them the pair is derived from
 * AUTH_SECRET, which every deployment already has, so notifications work with
 * no extra setup; the derivation is deterministic, so every server instance
 * signs with the same key. Rotating AUTH_SECRET therefore invalidates existing
 * subscriptions — browsers simply subscribe again from the autopilot page.
 */
export function vapidKeys(): { publicKey: string; privateKey: string } | null {
  if (cached !== undefined) return cached;
  if (env.vapidPublicKey && env.vapidPrivateKey) {
    cached = { publicKey: env.vapidPublicKey, privateKey: env.vapidPrivateKey };
  } else if (env.authSecret) {
    const seed = Buffer.from(hkdfSync("sha256", env.authSecret, "clipforge", "web-push vapid p256 v1", 32));
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(seed);
    cached = { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: seed.toString("base64url") };
  } else {
    cached = null;
  }
  return cached;
}

/** Push services contact the sender through this; it must be https or mailto. */
function subject(): string {
  return env.appUrl.startsWith("https://") ? env.appUrl : "mailto:dev@localhost";
}

/**
 * Notify every browser a user subscribed. Best effort: a push that fails is
 * logged and dropped, and a subscription the push service says is gone (404,
 * 410 — the user revoked it or cleared the site's data) is deleted.
 * Returns how many browsers accepted it.
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  const keys = vapidKeys();
  if (!keys) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 6 * 3600, urgency: "high" },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        else console.error(`[push] ${sub.endpoint.slice(0, 60)}… failed:`, err instanceof Error ? err.message : err);
      }
    }),
  );
  return delivered;
}
