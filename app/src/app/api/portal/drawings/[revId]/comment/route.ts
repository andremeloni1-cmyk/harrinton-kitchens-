import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { logActivity } from "@/lib/automations";
import { sendEmail } from "@/lib/google/gmail";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ revId: string }> };

// The client comments on a drawing revision → office is notified (push + email).
export async function POST(req: Request, { params }: Params) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const { revId } = await params;

  const rev = await prisma.drawingRevision.findFirst({
    where: { id: revId, drawingSet: { job: { clientId: portal.id } } },
    include: { drawingSet: { include: { job: { select: { id: true, title: true, reference: true } } } } },
  });
  if (!rev) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const text = String(body.body || "").trim().slice(0, 2000);
  if (!text) return json({ error: "Please write a comment." }, 400);

  await prisma.drawingComment.create({
    data: { revisionId: revId, authorType: "client", authorName: portal.name, body: text },
  });

  const job = rev.drawingSet.job;
  await logActivity(job.id, "note", `Client commented on ${rev.label}: ${text}`);
  await sendPush({
    title: `${BRAND.name} — drawing comment`,
    body: `${portal.name} commented on the drawings for ${job.title}`,
    url: `/jobs/${job.id}`,
  }).catch(() => {});
  const settings = await prisma.companySettings.findFirst();
  if (settings?.email) {
    await sendEmail({
      to: settings.email,
      subject: `Drawing comment — ${job.reference}`,
      body: `${portal.name} commented on ${rev.label} (${rev.drawingSet.name}):\n\n${text}`,
    }).catch(() => {});
  }
  return json({ ok: true });
}
