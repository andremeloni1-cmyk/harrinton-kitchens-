import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { scheduleForWeek, productionRisk } from "@/lib/capacity-server";

export const dynamic = "force-dynamic";

// The schedule board's week grid (station×day utilisation + blocks) plus the
// per-job risk list. `week` is any date in the target week (defaults to today).
export async function GET(req: Request) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const url = new URL(req.url);
  const week = url.searchParams.get("week") || new Date().toISOString().slice(0, 10);

  const [schedule, risk] = await Promise.all([scheduleForWeek(week), productionRisk()]);
  return json({ ...schedule, risk });
}
