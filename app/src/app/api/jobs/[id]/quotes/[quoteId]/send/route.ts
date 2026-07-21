import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { newPortalToken } from "@/lib/portal-session";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";
import { centsToDollars } from "@/lib/quote";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; quoteId: string }> };

const LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days to review

// Mark a quote as sent and email the client a magic link straight to their
// portal, where they can view the PDF and accept or request changes.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const { id, quoteId } = await params;

  const job = await prisma.job.findUnique({ where: { id }, include: { client: true } });
  if (!job) return json({ error: "not found" }, 404);
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, jobId: id } });
  if (!quote) return json({ error: "not found" }, 404);
  if (quote.totalCents <= 0) return json({ error: "Add lines to the quote before sending it." }, 400);

  await prisma.quote.update({ where: { id: quote.id }, data: { status: "sent" } });

  const email = job.client?.email || job.clientEmail;
  const name = job.client?.name || job.clientName || "there";
  let sent = false;
  if (job.clientId && email) {
    const { token, tokenHash } = newPortalToken();
    await prisma.clientPortalToken.create({
      data: { clientId: job.clientId, tokenHash, expiresAt: new Date(Date.now() + LINK_TTL_MS) },
    });
    const link = `${process.env.APP_URL || ""}/api/portal/verify?token=${encodeURIComponent(token)}`;
    const total = fmtMoney(centsToDollars(quote.totalCents), quote.currency);
    sent = await sendEmail({
      to: email,
      subject: `Your quote from ${BRAND.name} — ${total}`,
      body:
        `Hi ${name},\n\n` +
        `Your quote for "${job.title}" is ready to view (${total} inc GST).\n\n` +
        `Open your project portal to view the full quote and accept it or request changes:\n\n${link}\n\n` +
        `This secure link is valid for 14 days.`,
    });
    if (!sent) console.log(`[demo] Quote portal link for ${email}: ${link}`);
  }

  await logActivity(id, "note", `Quote v${quote.version} sent to the client${sent ? "" : " (demo — link logged)"}`);
  return json({ ok: true, sent, hasEmail: Boolean(email) });
}
