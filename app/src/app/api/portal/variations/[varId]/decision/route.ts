import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { logActivity } from "@/lib/automations";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ varId: string }> };

// The client approves (with a typed-name signature) or declines a variation.
// Approved variations flow into the job's contract value and final invoice.
export async function POST(req: Request, { params }: Params) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const { varId } = await params;

  const variation = await prisma.variation.findFirst({
    where: { id: varId, status: "sent", job: { clientId: portal.id } },
    include: { job: { select: { id: true, title: true, reference: true } } },
  });
  if (!variation) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const decision = body.decision === "approved" ? "approved" : body.decision === "declined" ? "declined" : null;
  if (!decision) return json({ error: "Choose approve or decline." }, 400);
  const signerName = String(body.signerName || "").trim();
  if (decision === "approved" && signerName.length < 2) {
    return json({ error: "Please type your full name to approve." }, 400);
  }
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  await prisma.approval.create({
    data: {
      jobId: variation.jobId,
      kind: "variation",
      decision: decision === "approved" ? "accepted" : "declined",
      signerName: signerName || null,
      comment: typeof body.comment === "string" ? body.comment.slice(0, 1000) : null,
      ip,
    },
  });
  await prisma.variation.update({ where: { id: varId }, data: { status: decision } });

  const amount = (variation.amountCents / 100).toFixed(2);
  await logActivity(
    variation.jobId,
    "note",
    `Variation "${variation.title}" (${amount}) ${decision} by ${signerName || "client"}`
  );
  await sendPush({
    title: `${BRAND.name} — variation ${decision}`,
    body: `${signerName || "The client"} ${decision} "${variation.title}" on ${variation.job.title}`,
    url: `/jobs/${variation.jobId}`,
  }).catch(() => {});

  return json({ ok: true });
}
