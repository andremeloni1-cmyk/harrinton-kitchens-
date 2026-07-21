import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

const serialize = (m: { id: string; sender: string; authorName: string | null; body: string; createdAt: Date }) => ({
  id: m.id, sender: m.sender, authorName: m.authorName, body: m.body, createdAt: m.createdAt.toISOString(),
});

// The client's message thread for one of their jobs (portal side).
export async function GET(req: Request) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const jobId = new URL(req.url).searchParams.get("jobId") || "";
  const job = await prisma.job.findFirst({ where: { id: jobId, clientId: portal.id }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);
  const messages = await prisma.portalMessage.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" } });
  return json({ messages: messages.map(serialize) });
}

// The client posts a message → notifies the office by push.
export async function POST(req: Request) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!text) return json({ error: "Write a message." }, 400);

  const [client, job] = await Promise.all([
    prisma.client.findUnique({ where: { id: portal.id }, select: { name: true } }),
    prisma.job.findFirst({ where: { id: jobId, clientId: portal.id }, select: { id: true, title: true } }),
  ]);
  if (!job || !client) return json({ error: "not found" }, 404);

  const message = await prisma.portalMessage.create({
    data: { jobId: job.id, clientId: portal.id, sender: "client", authorName: client.name, body: text },
  });
  await sendPush({ title: `Message from ${client.name}`, body: `${job.title}: ${text.slice(0, 80)}`, url: `/jobs/${job.id}` }).catch(() => {});

  return json({ ok: true, message: serialize(message) }, 201);
}
