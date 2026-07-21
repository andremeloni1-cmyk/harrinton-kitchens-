import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

// The client's variations that have been sent to them (awaiting a decision or
// already decided).
export async function GET() {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);

  const variations = await prisma.variation.findMany({
    where: { status: { in: ["sent", "approved", "declined"] }, job: { clientId: portal.id } },
    orderBy: { createdAt: "desc" },
    include: { job: { select: { id: true, title: true, reference: true } } },
  });

  return json({
    variations: variations.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description,
      amountCents: v.amountCents,
      status: v.status,
      job: v.job,
    })),
  });
}
