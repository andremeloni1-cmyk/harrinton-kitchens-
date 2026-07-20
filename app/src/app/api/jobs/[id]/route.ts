import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { onStatusChange, onReschedule, removeCalendar } from "@/lib/automations";
import { isOverdue } from "@/lib/invoices";
import { rememberContact } from "@/lib/contacts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({
    where: { id: (await params).id },
    include: {
      // Never pull fileData here — inline plan bytes would bloat every job load.
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, webViewLink: true, source: true, mimeType: true, createdAt: true,
          sharedWithClient: true, reviewStatus: true, reviewNote: true, reviewedAt: true,
        },
      },
      tradeVisits: { orderBy: { scheduledStart: "asc" } },
      installer: { select: { id: true, name: true, color: true } },
      reports: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!job) return json({ error: "not found" }, 404);
  const source = job.companyId
    ? await prisma.leadSource.findUnique({ where: { id: job.companyId } })
    : null;
  return json({
    job: {
      ...job,
      companyName: source ? (source.displayName || source.name).trim() : null,
      invoices: job.invoices.map((inv) => ({ ...inv, overdue: isOverdue(inv) })),
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const existing = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  for (const f of ["title", "description", "address", "companyId", "installerId", "clientName", "clientEmail", "clientPhone", "priority", "notes", "currency"]) {
    if (f in body) data[f] = body[f] || null;
  }
  if ("quoteAmount" in body) data.quoteAmount = body.quoteAmount != null ? Number(body.quoteAmount) : null;
  if ("durationMins" in body) data.durationMins = Number(body.durationMins) || existing.durationMins;
  if ("flag" in body) data.flag = body.flag || null; // clear/set the review flag

  const timeChanged =
    ("scheduledStart" in body || "scheduledEnd" in body);
  if ("scheduledStart" in body) data.scheduledStart = parseDate(body.scheduledStart);
  if ("scheduledEnd" in body) data.scheduledEnd = parseDate(body.scheduledEnd);

  const statusChanged = "status" in body && body.status !== existing.status;
  if (statusChanged) {
    data.status = body.status;
    // Stamp the real completion time the first time a job is completed; clear
    // it if the job is reopened out of completed.
    if (body.status === "completed" && !existing.completedAt) data.completedAt = new Date();
    else if (existing.status === "completed" && body.status !== "completed") data.completedAt = null;
  }

  const job = await prisma.job.update({ where: { id: (await params).id }, data });

  // Remember the site contact when it was part of this edit.
  if ("clientEmail" in body || "clientPhone" in body || "clientName" in body) {
    await rememberContact({ name: job.clientName, email: job.clientEmail, phone: job.clientPhone }).catch(() => {});
  }

  // Run automations after persisting.
  if (statusChanged) {
    await onStatusChange(job, existing.status).catch(() => {});
  } else if (timeChanged && ["accepted", "scheduled", "in_progress"].includes(job.status)) {
    // Feature 2: a "move" — only notify when explicitly requested.
    await onReschedule(job, body.notify !== false).catch(() => {});
  }

  return json({ job });
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const existing = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!existing) return json({ error: "not found" }, 404);

  // Feature 2: deleting a job also removes its calendar event.
  await removeCalendar(existing).catch(() => {});
  await prisma.job.delete({ where: { id: (await params).id } });
  return json({ ok: true });
}
