import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { ensureClientRows, clientKey, companyDisplayName } from "@/lib/clients";
import { ensureDefaultLeadSources } from "@/lib/leads";
import { isOverdue } from "@/lib/invoices";
import { isFilled, parseSelections, type SelectionEntry } from "@/lib/selections";
import type { Client, Invoice } from "@prisma/client";

export const dynamic = "force-dynamic";

type ClientJob = {
  id: string;
  reference: string;
  title: string;
  status: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  quoteAmount: number | null;
  currency: string;
  siteContact: string | null;
  address: string | null;
  // What they chose for this job — only the decided rows, so the clients list
  // stays small while still answering "what colour were their doors".
  selections: SelectionEntry[];
};

type ClientInvoice = {
  id: string;
  number: string;
  status: string;
  total: number;
  amountDue: number;
  dueDate: Date | null;
  currency: string;
  overdue: boolean;
};

type Pipeline = {
  leads: number;
  leadsValue: number;
  won: number;
  wonValue: number;
  lost: number;
  lostValue: number;
};

type ClientAgg = {
  key: string;
  clientId: string | null;
  companyId: string | null; // set for the builder companies; null = private client
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  leadSource: string | null;
  jobCount: number;
  activeCount: number;
  totalValue: number;
  currency: string;
  lastActivityAt: string;
  jobs: ClientJob[];
  invoiced: number;
  paid: number;
  outstanding: number;
  overdueCount: number;
  xeroLinked: boolean;
  invoices: ClientInvoice[];
  pipeline: Pipeline;
};

const ACTIVE = (s: string) => !["completed", "cancelled"].includes(s);

function emptyAgg(key: string, name: string): ClientAgg {
  return {
    key,
    clientId: null,
    companyId: null,
    name,
    email: null,
    phone: null,
    address: null,
    leadSource: null,
    jobCount: 0,
    activeCount: 0,
    totalValue: 0,
    currency: "AUD",
    lastActivityAt: new Date(0).toISOString(),
    jobs: [],
    invoiced: 0,
    paid: 0,
    outstanding: 0,
    overdueCount: 0,
    xeroLinked: false,
    invoices: [],
    pipeline: { leads: 0, leadsValue: 0, won: 0, wonValue: 0, lost: 0, lostValue: 0 },
  };
}

function foldInvoices(agg: ClientAgg, row: Client & { invoices: Invoice[] }) {
  agg.clientId = row.id;
  agg.xeroLinked = Boolean(row.xeroContactId);
  for (const inv of row.invoices) {
    if (inv.status === "voided") continue;
    const overdue = isOverdue(inv);
    agg.invoiced += inv.total;
    agg.paid += inv.amountPaid;
    if (["submitted", "authorised"].includes(inv.status)) agg.outstanding += inv.amountDue;
    if (overdue) agg.overdueCount += 1;
    agg.invoices.push({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      total: inv.total,
      amountDue: inv.amountDue,
      dueDate: inv.dueDate,
      currency: inv.currency,
      overdue,
    });
  }
}

/**
 * Clients are the builder COMPANIES the owner works for (LeadSource rows) —
 * every job from a company groups under it, with the homeowner shown as the
 * job's site contact. Jobs with no company (direct/private work) group by the
 * person as before. Invoice totals attach via each group's Client row.
 */
export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);

  await ensureDefaultLeadSources().catch(() => {});
  await ensureClientRows().catch(() => {});

  const sources = await prisma.leadSource.findMany({ where: { enabled: true } });
  const jobs = await prisma.job.findMany({ orderBy: { createdAt: "desc" } });
  // One query for every job's selections, grouped here — a per-job include on
  // the jobs query would be a second read per row on a list this page loads on
  // every visit.
  const selectionsByJob = new Map<string, SelectionEntry[]>();
  for (const row of await prisma.selection.findMany({ orderBy: { position: "asc" } })) {
    const [entry] = parseSelections([row]);
    if (!entry || !isFilled(entry)) continue;
    const list = selectionsByJob.get(row.jobId);
    if (list) list.push(entry);
    else selectionsByJob.set(row.jobId, [entry]);
  }
  const clientRows = await prisma.client.findMany({
    include: { invoices: { orderBy: { createdAt: "desc" } } },
  });
  const clientById = new Map(clientRows.map((c) => [c.id, c]));
  const clientByName = new Map(clientRows.map((c) => [c.name.trim().toLowerCase(), c]));

  const map = new Map<string, ClientAgg>();

  // Companies first, so they always show (even before their first job).
  const bySourceId = new Map<string, ClientAgg>();
  for (const s of sources) {
    const name = companyDisplayName(s);
    const agg = emptyAgg(`company:${s.id}`, name);
    agg.companyId = s.id;
    agg.email = s.email; // the trusted domain — shown as the contact line
    agg.leadSource = s.email;
    const row = clientByName.get(name.toLowerCase());
    if (row) foldInvoices(agg, row);
    map.set(agg.key, agg);
    bySourceId.set(s.id, agg);
  }

  for (const j of jobs) {
    let agg: ClientAgg | undefined;
    if (j.companyId && bySourceId.has(j.companyId)) {
      agg = bySourceId.get(j.companyId);
    } else {
      // Private/direct job — group by the person.
      const key = clientKey(j.clientEmail, j.clientName);
      if (!key) continue;
      agg = map.get(`person:${key}`);
      if (!agg) {
        agg = emptyAgg(`person:${key}`, j.clientName || j.clientEmail || "Unnamed client");
        agg.email = j.clientEmail || null;
        agg.phone = j.clientPhone || null;
        agg.address = j.address || null;
        agg.leadSource = j.leadSource || null;
        const row = j.clientId ? clientById.get(j.clientId) : undefined;
        if (row) foldInvoices(agg, row);
        map.set(agg.key, agg);
      }
    }
    if (!agg) continue;

    const when = (j.scheduledStart || j.createdAt).toISOString();
    agg.jobCount += 1;
    if (ACTIVE(j.status)) agg.activeCount += 1;
    if (j.status !== "cancelled" && j.quoteAmount) agg.totalValue += j.quoteAmount;
    if (when > agg.lastActivityAt) agg.lastActivityAt = when;
    if (!agg.phone && j.clientPhone && !agg.companyId) agg.phone = j.clientPhone;

    const value = j.quoteAmount || 0;
    if (j.status === "lead") {
      agg.pipeline.leads += 1;
      agg.pipeline.leadsValue += value;
    } else if (j.status === "cancelled") {
      agg.pipeline.lost += 1;
      agg.pipeline.lostValue += value;
    } else {
      agg.pipeline.won += 1;
      agg.pipeline.wonValue += value;
    }

    agg.jobs.push({
      id: j.id,
      reference: j.reference,
      title: j.title,
      status: j.status,
      scheduledStart: j.scheduledStart,
      scheduledEnd: j.scheduledEnd,
      quoteAmount: j.quoteAmount,
      currency: j.currency,
      siteContact: j.clientName,
      address: j.address,
      selections: selectionsByJob.get(j.id) || [],
    });
  }

  const clients = [...map.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return json({ clients });
}
