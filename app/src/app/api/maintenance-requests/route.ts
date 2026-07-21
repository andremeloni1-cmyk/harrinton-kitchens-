import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

// Pending portal maintenance requests for the office triage inbox (P10.5).
export async function GET() {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const requests = await prisma.maintenanceRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true, email: true, phone: true } } },
  });
  const withSource = await Promise.all(
    requests.map(async (r) => {
      const source = r.sourceJobId ? await prisma.job.findUnique({ where: { id: r.sourceJobId }, select: { reference: true, title: true } }) : null;
      return {
        id: r.id,
        clientName: r.client.name,
        clientPhone: r.phone || r.client.phone,
        message: r.message,
        sourceRef: source ? `${source.reference} — ${source.title}` : null,
        createdAt: r.createdAt.toISOString(),
      };
    })
  );
  return json({ requests: withSource });
}
