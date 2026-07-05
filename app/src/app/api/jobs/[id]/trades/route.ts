import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const trades = await prisma.tradeVisit.findMany({
    where: { jobId: (await params).id },
    orderBy: { scheduledStart: "asc" },
  });
  return json({ trades });
}

export async function POST(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const trade = typeof body.trade === "string" ? body.trade.trim() : "";
  const scheduledStart = parseDate(body.scheduledStart);
  if (!trade || !scheduledStart) return json({ error: "trade and scheduledStart are required" }, 400);

  const visit = await prisma.tradeVisit.create({
    data: {
      jobId: job.id,
      trade,
      company: body.company?.trim() || null,
      scheduledStart,
      scheduledEnd: parseDate(body.scheduledEnd),
      notes: body.notes?.trim() || null,
    },
  });
  await logActivity(job.id, "note", `Trade visit booked: ${trade} on site.`).catch(() => {});
  return json({ visit }, 201);
}
