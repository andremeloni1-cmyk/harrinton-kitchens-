import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { computeRisks } from "@/lib/risk-server";
import { formatRisks } from "@/lib/risk";

export const dynamic = "force-dynamic";

// On-demand risk digest for the office (P12.3). Deterministic checks with named
// thresholds; also emailed in the weekly summary.
export async function GET() {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const risks = await computeRisks();
  return json({ risks, lines: formatRisks(risks) });
}
