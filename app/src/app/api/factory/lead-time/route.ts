import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { earliestInstall } from "@/lib/capacity-server";

export const dynamic = "force-dynamic";

// Live lead-time answer for sales (P9.3): earliest realistic install date for a
// job of ~N cabinets given the current shop load. Deterministic.
export async function GET(req: Request) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const n = Number(new URL(req.url).searchParams.get("cabinets"));
  const cabinets = Number.isFinite(n) && n > 0 ? n : 10;
  return json(await earliestInstall(cabinets));
}
