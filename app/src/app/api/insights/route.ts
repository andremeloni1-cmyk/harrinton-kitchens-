import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { computeInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  return json(await computeInsights());
}
