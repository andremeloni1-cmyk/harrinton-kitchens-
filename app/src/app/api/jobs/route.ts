import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { jobListQuery } from "@/lib/job-list";
import { json, createJobWithReference, parseDate } from "@/lib/utils";
import { isAuthenticated, requirePermission } from "@/lib/session";
import { onStatusChange } from "@/lib/automations";
import { rememberContact } from "@/lib/contacts";
import { stageForLegacyStatus } from "@/lib/pipeline";
import { EMAIL_RE } from "@/lib/enquiry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const scheduled = searchParams.get("scheduled");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (scheduled === "1") where.scheduledStart = { not: null };

  const jobs = await jobListQuery(where);
  return json({ jobs });
}

export async function POST(req: Request) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));

  if (!body.title || typeof body.title !== "string") {
    return json({ error: "title is required" }, 400);
  }

  // Reject a malformed / CR-LF-bearing client email — it would inject headers
  // into every automated email for this job (P1-12).
  if (typeof body.clientEmail === "string") body.clientEmail = body.clientEmail.trim();
  if (body.clientEmail && !EMAIL_RE.test(body.clientEmail)) {
    return json({ error: "That email address doesn't look right." }, 400);
  }

  const status = body.status || "lead";

  // A user-supplied reference bypasses the auto-retry (which only recomputes the
  // generated number), so a duplicate would otherwise exhaust the retries and
  // surface as an opaque 500. Reject it cleanly up front, and still translate a
  // raced P2002 below to a 409.
  const customRef = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : null;
  if (customRef) {
    const clash = await prisma.job.findFirst({ where: { reference: customRef }, select: { id: true } });
    if (clash) return json({ error: `Reference ${customRef} is already in use.` }, 409);
  }

  const job = await createJobWithReference((reference) => ({
    reference: customRef || reference,
    title: body.title,
    description: body.description || null,
    status,
    pipelineStage: stageForLegacyStatus(status),
    priority: body.priority || "normal",
    companyId: body.companyId || null,
    installerId: body.installerId || null,
    address: body.address || null,
    clientName: body.clientName || null,
    clientEmail: body.clientEmail || null,
    clientPhone: body.clientPhone || null,
    quoteAmount: body.quoteAmount != null ? Number(body.quoteAmount) : null,
    durationMins: body.durationMins ? Number(body.durationMins) : 120,
    scheduledStart: parseDate(body.scheduledStart),
    scheduledEnd: parseDate(body.scheduledEnd),
    notes: body.notes || null,
    completedAt: status === "completed" ? new Date() : null,
  })).catch((e) => {
    // A custom reference that collided with a concurrent create — surface a 409,
    // not the raw P2002 the retry loop re-throws once it gives up.
    if (customRef && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  });
  if (!job) return json({ error: `Reference ${customRef} is already in use.` }, 409);

  // Remember the site contact for future autosuggest.
  await rememberContact({ name: job.clientName, email: job.clientEmail, phone: job.clientPhone }).catch(() => {});

  // If a job is created already in a confirmed/scheduled state, run automations.
  if (status !== "lead") {
    await onStatusChange(job, "lead").catch(() => {});
  }

  return json({ job }, 201);
}
