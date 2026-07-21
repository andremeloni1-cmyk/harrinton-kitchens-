import { prisma } from "@/lib/db";
import { json, createJobWithReference } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { legacyStatusForStage } from "@/lib/pipeline";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Triage a maintenance request: convert it to a MAINTENANCE job (client notified)
// or dismiss it (P10.5).
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === "convert" ? "convert" : body.action === "dismiss" ? "dismiss" : null;
  if (!action) return json({ error: "Unknown action." }, 400);

  const request = await prisma.maintenanceRequest.findUnique({ where: { id }, include: { client: true } });
  if (!request) return json({ error: "not found" }, 404);
  if (request.status !== "pending") return json({ error: "Already handled." }, 400);

  if (action === "dismiss") {
    await prisma.maintenanceRequest.update({ where: { id }, data: { status: "dismissed" } });
    return json({ ok: true });
  }

  const client = request.client;
  const source = request.sourceJobId ? await prisma.job.findUnique({ where: { id: request.sourceJobId }, select: { reference: true, title: true, address: true } }) : null;

  const job = await createJobWithReference((reference) => ({
    reference,
    title: `Maintenance visit — ${client.name}`,
    description: source ? `Re: ${source.title} (${source.reference})\n\n${request.message}` : request.message,
    pipelineStage: "MAINTENANCE",
    status: legacyStatusForStage("MAINTENANCE"),
    priority: "normal",
    address: source?.address || client.address || null,
    client: { connect: { id: client.id } },
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: request.phone || client.phone,
    notes: "Converted from a client-portal maintenance request.",
    leadSource: "client-portal",
  }));

  await prisma.maintenanceRequest.update({ where: { id }, data: { status: "converted", convertedJobId: job.id } });
  await logActivity(job.id, "note", `Maintenance job created from ${client.name}'s portal request.`).catch(() => {});

  if (client.email) {
    await sendEmail({
      to: client.email,
      subject: `We've scheduled your maintenance visit — ${BRAND.name}`,
      body: `Hi ${client.name},\n\nThanks for letting us know. We've logged your maintenance request and our team will be in touch shortly to confirm a visit time.\n\n— ${BRAND.name}`,
    }).catch(() => {});
  }

  return json({ ok: true, reference: job.reference, jobId: job.id }, 201);
}
