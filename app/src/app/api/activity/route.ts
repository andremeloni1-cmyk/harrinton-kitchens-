import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

// Global activity feed — what the automations did, across all jobs.
export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const activities = await prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { job: { select: { id: true, title: true, reference: true } } },
  });
  return json({ activities });
}
