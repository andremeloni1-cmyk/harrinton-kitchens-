import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { loadOrderList } from "@/lib/hardware-order-server";
import { orderSummary, groupBySupplier } from "@/lib/hardware-order";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * The job's hardware order list, netted against free stock.
 *
 * Recomputed on every read rather than stored. The answer depends on what every
 * other live job is holding and on what is physically on the shelf, both of
 * which move independently of this job — a cached list would be wrong within
 * minutes and wrong in the direction that costs money.
 */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const lines = await loadOrderList(jobId);
  return json({ lines, summary: orderSummary(lines), bySupplier: groupBySupplier(lines) });
}
