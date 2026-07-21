import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission, getSessionUser } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";
import type { PortalMessage } from "@prisma/client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export function serializeMessage(m: PortalMessage) {
  return { id: m.id, sender: m.sender, authorName: m.authorName, body: m.body, createdAt: m.createdAt.toISOString() };
}

// The job's client ↔ office message thread (office side).
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const [job, messages] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { clientName: true, clientId: true } }),
    prisma.portalMessage.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } }),
  ]);
  return json({ clientName: job?.clientName ?? null, hasClient: Boolean(job?.clientId), messages: messages.map(serializeMessage) });
}

// Office posts a reply → notifies the client by email.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const user = await getSessionUser();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, clientId: true, clientEmail: true, clientName: true } });
  if (!job) return json({ error: "not found" }, 404);
  if (!job.clientId) return json({ error: "This job has no linked client to message." }, 400);

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!text) return json({ error: "Write a message." }, 400);

  const message = await prisma.portalMessage.create({
    data: { jobId, clientId: job.clientId, sender: "office", authorName: user?.name ?? BRAND.name, body: text },
  });
  await logActivity(jobId, "note", `Message sent to ${job.clientName || "client"}`);

  if (job.clientEmail) {
    await sendEmail({
      to: job.clientEmail,
      subject: `New message about ${job.title}`,
      body: `Hi ${job.clientName || "there"},\n\nYou have a new message from the ${BRAND.name} team about "${job.title}". You can read and reply to it in your client portal.\n\n— ${BRAND.name}`,
    }).catch(() => {});
  }

  return json({ ok: true, message: serializeMessage(message) }, 201);
}
