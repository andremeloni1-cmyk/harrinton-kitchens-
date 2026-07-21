import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

// Portal endpoint: the signed-in client requests a maintenance / warranty visit.
// Creates a MaintenanceRequest the office triages (P10.5) — it does not create a
// job directly; the office converts it. The client comes from the portal
// session, so a request can only ever be filed for oneself.
export async function POST(req: Request) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "A message is required" }, 400);
  if (message.length > 2000) return json({ error: "message is too long" }, 400);

  const client = await prisma.client.findUnique({ where: { id: portal.id } });
  if (!client) return json({ error: "not found" }, 404);

  const sourceJob =
    typeof body.jobId === "string" && body.jobId
      ? await prisma.job.findFirst({ where: { id: body.jobId, clientId: client.id }, select: { id: true } })
      : null;
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 40) : null;

  await prisma.maintenanceRequest.create({
    data: { clientId: client.id, sourceJobId: sourceJob?.id ?? null, message, phone },
  });

  await sendPush({
    title: "New maintenance request",
    body: `${client.name}: ${message.slice(0, 80)}`,
    url: "/",
  }).catch(() => {});

  return json({ ok: true }, 201);
}
