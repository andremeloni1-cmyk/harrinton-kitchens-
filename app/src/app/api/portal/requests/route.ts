import { prisma } from "@/lib/db";
import { json, createJobWithReference } from "@/lib/utils";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

// Public (portal) endpoint: a client requests a maintenance visit. Creates a
// job to confirm on the dashboard — the same flow as an emailed lead. In
// production the portal link itself is the secret; here we only accept ids
// that resolve to a real client.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!clientId || !message) return json({ error: "clientId and message are required" }, 400);
  if (message.length > 2000) return json({ error: "message is too long" }, 400);

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return json({ error: "not found" }, 404);

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
