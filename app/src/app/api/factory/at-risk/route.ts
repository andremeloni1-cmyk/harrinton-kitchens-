import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { productionRisk } from "@/lib/capacity-server";

export const dynamic = "force-dynamic";

// At-risk production jobs for the office dashboard (P9.2).
export async function GET() {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobs = (await productionRisk()).filter((j) => j.atRisk);
  return json({ jobs });
}
