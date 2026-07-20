import { prisma } from "@/lib/db";
import { json, timingSafeEqualStr } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { sendEmail } from "@/lib/google/gmail";
import { buildWeeklySummary, formatWeeklySummary } from "@/lib/summary";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

// Session (manual "send me this week's summary") or the weekly cron may trigger.
async function authorized(req: Request): Promise<boolean> {
  if (await isAuthenticated()) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && timingSafeEqualStr(req.headers.get("x-cron-secret"), secret));
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);

  const account = await prisma.account.findFirst();
  const to = account?.email;
  if (!to) return json({ ok: false, error: "No owner email on file." }, 400);

  const companyName = account?.name || BRAND.name;
  const summary = await buildWeeklySummary();
  const body = formatWeeklySummary(summary, "AUD", companyName);

  const sent = await sendEmail({
    to,
    subject: `${companyName} — your week (${summary.completed.count} done, ${summary.paid.count} paid)`,
    body,
  });

  // Not connected to Gmail → still return the computed summary so a manual
  // caller can see it; the cron simply logs a non-fatal miss.
  if (!sent) return json({ ok: false, sent: false, reason: "Gmail not connected", summary });
  return json({ ok: true, sent: true, to, summary });
}
