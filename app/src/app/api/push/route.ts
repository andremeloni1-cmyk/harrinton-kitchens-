import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

// Tells the client whether push is set up and the public VAPID key to subscribe with.
export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  return json({ configured: pushConfigured(), publicKey: vapidPublicKey() });
}

// Save (or refresh) a device's push subscription.
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const endpoint = body?.endpoint as string | undefined;
  const p256dh = body?.keys?.p256dh as string | undefined;
  const auth = body?.keys?.auth as string | undefined;
  if (!endpoint || !p256dh || !auth) return json({ error: "invalid subscription" }, 400);

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth },
    update: { p256dh, auth },
  });
  return json({ ok: true });
}

// Remove a device's subscription (turn notifications off here).
export async function DELETE(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const endpoint = body?.endpoint as string | undefined;
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return json({ ok: true });
}
