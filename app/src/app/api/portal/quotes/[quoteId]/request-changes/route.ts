import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { logActivity } from "@/lib/automations";
import { sendEmail } from "@/lib/google/gmail";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ quoteId: string }> };

// The client asks for changes instead of accepting: recorded in an Approval, the
// quote is flagged, and the office is notified (push + email).
export async function POST(req: Request, { params }: Params) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const { quoteId } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, job: { clientId: portal.id } },
    include: { job: true },
  });
  if (!quote) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const comment = String(body.comment || "").trim().slice(0, 2000);
  if (!comment) return json({ error: "Please describe the changes you'd like." }, 400);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  await prisma.approval.create({
    data: { jobId: quote.jobId, quoteId: quote.id, kind: "quote", decision: "changes_requested", comment, ip },
  });
  await prisma.quote.update({ where: { id: quote.id }, data: { status: "changes_requested" } });

  await logActivity(quote.jobId, "note", `Client requested changes to quote v${quote.version}: ${comment}`);

  // Notify the office.
  await sendPush({
    title: `${BRAND.name} — changes requested`,
    body: `Changes requested on the quote for ${quote.job.title}`,
    url: `/jobs/${quote.jobId}`,
  }).catch(() => {});
  const settings = await prisma.companySettings.findFirst();
  if (settings?.email) {
    await sendEmail({
      to: settings.email,
      subject: `Quote changes requested — ${quote.job.reference}`,
      body:
        `The client requested changes to quote v${quote.version} for "${quote.job.title}":\n\n` +
        `${comment}\n\n` +
        `Open the job to revise and resend the quote.`,
    }).catch(() => {});
  }

  return json({ ok: true });
}
