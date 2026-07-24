import { prisma } from "@/lib/db";
import { jobListQuery } from "@/lib/job-list";
import { json, createJobWithReference, parseDate } from "@/lib/utils";
import { isAuthenticated, requirePermission } from "@/lib/session";
import { onStatusChange } from "@/lib/automations";
import { rememberContact } from "@/lib/contacts";
import { stageForLegacyStatus } from "@/lib/pipeline";

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

  const status = body.status || "lead";

  const job = await createJobWithReference((reference) => ({
    reference: body.reference || reference,
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
  }));

  // Remember the site contact for future autosuggest.
  await rememberContact({ name: job.clientName, email: job.clientEmail, phone: job.clientPhone }).catch(() => {});

  // If a job is created already in a confirmed/scheduled state, run automations.
  if (status !== "lead") {
    await onStatusChange(job, "lead").catch(() => {});
  }

  return json({ job }, 201);
}
