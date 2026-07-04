import webpush from "web-push";
import { prisma } from "@/lib/db";

// Web Push is configured with a VAPID key pair. Generate one once with:
//   npx web-push generate-vapid-keys
// then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and optional VAPID_SUBJECT) in .env.

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured = false;
function ensureConfigured(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:owner@example.com",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    configured = true;
  }
  return true;
}

/** Sends a notification to every subscribed device. Dead subscriptions
 * (410 Gone / 404) are pruned. No-op if push isn't configured. */
export async function sendPush(payload: { title: string; body: string; url?: string }): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany();
  const data = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || "/" });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        data
      );
      sent++;
    } catch (e: unknown) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
    }
  }
  return sent;
}
