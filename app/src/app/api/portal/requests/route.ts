import { prisma } from "@/lib/db";
import { json, createJobWithReference } from "@/lib/utils";
import { logActivity } from "@/lib/automations";
import { getPortalClient } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

// Portal endpoint: the signed-in client requests a maintenance visit. Creates a
// job to confirm on the dashboard — the same flow as an emailed lead. The client
// comes from the portal session, so a request can only ever be filed for oneself.
export async function POST(req: Request) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "A message is required" }, 400);
  if (message.length > 2000) return json({ error: "message is too long" }, 400);

  const client = await prisma.client.findUnique({ where: { id: portal.id } });
  if (!client) return json({ error: "not found" }, 404);
  const clientId = client.id;

  // Tie the request back to the original install when one was picked.
  const sourceJob =
    typeof body.jobId === "string" && body.jobId
      ? await prisma.job.findFirst({ where: { id: body.jobId, clientId } })
      : null;

  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 40) : null;

  const job = await createJobWithReference((reference) => ({
    reference,
    title: `Maintenance visit — ${client.name}`,
    description: sourceJob ? `Re: ${sourceJob.title} (${sourceJob.reference})\n\n${message}` : message,
    status: "lead",
    priority: "normal",
    address: sourceJob?.address || client.address || null,
    client: { connect: { id: client.id } },
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: phone || client.phone,
    notes: "Requested via the client portal.",
    leadSource: "client-portal",
  }));

  await logActivity(job.id, "note", `Maintenance visit requested by ${client.name} via the client portal.`).catch(() => {});

  return json({ ok: true, reference: job.reference }, 201);
}
