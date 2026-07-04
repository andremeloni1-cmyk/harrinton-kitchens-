import { json, timingSafeEqualStr } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { isXeroConnected } from "@/lib/xero/oauth";
import { syncInvoiceStatuses } from "@/lib/invoices";

export const dynamic = "force-dynamic";

// Allow either a logged-in user (manual "Sync now") or the cron job
// (presents the shared CRON_SECRET) to pull invoice statuses from Xero.
async function authorized(req: Request): Promise<boolean> {
  if (await isAuthenticated()) return true;
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
