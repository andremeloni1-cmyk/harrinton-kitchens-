import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { xeroConfigured, isXeroConnected } from "@/lib/xero/oauth";
import { fetchProfitAndLoss } from "@/lib/xero/reports";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { searchParams } = new URL(req.url);

  const from = searchParams.get("from") || monthStart();
  const to = searchParams.get("to") || today();
  if (!YMD.test(from) || !YMD.test(to)) {
    return json({ error: "from/to must be YYYY-MM-DD" }, 400);
  }

  const xero = { configured: xeroConfigured(), connected: await isXeroConnected() };
  if (!xero.connected) return json({ report: null, xero });

  try {
    const report = await fetchProfitAndLoss(from, to);
    return json({ report, xero });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "P&L fetch failed" }, 502);
  }
}
