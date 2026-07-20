import { json, timingSafeEqualStr } from "@/lib/utils";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isXeroConnected } from "@/lib/xero/oauth";
import { syncInvoiceStatuses } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// Allow either a money-permitted user (manual "Sync now") or the cron job
// (presents the shared CRON_SECRET) to pull invoice statuses from Xero.
async function authorized(req: Request): Promise<boolean> {
  const user = await getSessionUser();
  if (user && can(user, "edit_money")) return true;
  const secret = process.env.CRON_SECRET;
  if (secret && timingSafeEqualStr(req.headers.get("x-cron-secret"), secret)) return true;
  return false;
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);
  if (!(await isXeroConnected())) return json({ ok: true, connected: false, updated: 0 });
  try {
    const result = await syncInvoiceStatuses();
    return json({ ok: true, connected: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, 500);
  }
}
