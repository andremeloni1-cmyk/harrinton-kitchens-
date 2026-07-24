import { prisma } from "@/lib/db";
import type { Client, Job } from "@prisma/client";
import { emailDomain } from "@/lib/utils";

/** The identity key private (non-company) clients are grouped by: email first,
 * falling back to name. */
export function clientKey(email?: string | null, name?: string | null): string | null {
  const key = (email || name || "").trim().toLowerCase();
  return key || null;
}

async function findClientFor(
  email: string | null,
  name: string | null
): Promise<Client | null> {
  if (email) {
    const byEmail = await prisma.client.findFirst({
      where: { email: { equals: email } },
    });
    if (byEmail) return byEmail;
  }
  if (name) {
    return prisma.client.findFirst({ where: { name: { equals: name } } });
  }
  return null;
}

/** The pretty client name for a lead source (company). */
export function companyDisplayName(source: { displayName?: string | null; name: string }): string {
  return (source.displayName || source.name).trim();
}

/**
 * The ONE Client row for a company (LeadSource). Looked up by the company's
 * display name; created without an email — Xero contact matching then goes by
 * the company name, which is what the accounts contact is called in Xero.
 */
export async function companyClientFor(companyId: string): Promise<Client | null> {
  const source = await prisma.leadSource.findUnique({ where: { id: companyId } });
  if (!source) return null;
  const name = companyDisplayName(source);

  const existing = await prisma.client.findFirst({ where: { name: { equals: name } } });
  if (existing) return existing;
  return prisma.client.create({ data: { name } });
}

/** Resolve a job's leadSource sender to a LeadSource company id by domain. */
async function companyIdFromLeadSource(leadSource: string): Promise<string | null> {
  const domain = emailDomain(leadSource);
  if (!domain) return null;
  const sources = await prisma.leadSource.findMany();
  // Compare on the domain part so a source stored as a full address still matches.
  return sources.find((s) => domain.includes(emailDomain(s.email)))?.id || null;
}

/**
 * Idempotent backfill, run lazily from the clients API:
 * 1. Jobs with a leadSource but no companyId get their company resolved by
 *    domain (covers jobs scanned before companyId existed).
 * 2. Jobs are linked to their client row — the COMPANY's Client when they
 *    belong to a company, else a private client from the site-contact details.
 * Re-links jobs whose clientId points at an old per-homeowner row.
 */
export async function ensureClientRows(): Promise<{ created: number; linked: number }> {
  let created = 0;
  let linked = 0;

  // 1. Backfill companyId from leadSource domains.
  const unresolved = await prisma.job.findMany({
    where: { companyId: null, leadSource: { not: null } },
  });
  for (const job of unresolved) {
    const companyId = await companyIdFromLeadSource(job.leadSource!);
    if (companyId) {
      await prisma.job.update({ where: { id: job.id }, data: { companyId } });
      job.companyId = companyId;
    }
  }

  // 2. Company jobs → company Client (also re-points old homeowner links).
  const companyJobs = await prisma.job.findMany({ where: { companyId: { not: null } } });
  const companyClients = new Map<string, Client | null>();
  for (const job of companyJobs) {
    let client = companyClients.get(job.companyId!);
    if (client === undefined) {
      const before = await prisma.client.count();
      client = await companyClientFor(job.companyId!);
      if ((await prisma.client.count()) > before) created++;
      companyClients.set(job.companyId!, client);
    }
    if (client && job.clientId !== client.id) {
      await prisma.job.update({ where: { id: job.id }, data: { clientId: client.id } });
      linked++;
    }
  }

  // 3. Private jobs (no company) → per-person Client from site-contact details.
  const privateJobs = await prisma.job.findMany({
    where: {
      companyId: null,
      clientId: null,
      OR: [{ clientEmail: { not: null } }, { clientName: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
  });
  const byKey = new Map<string, Client>();
  for (const job of privateJobs) {
    const email = job.clientEmail?.trim().toLowerCase() || null;
    const name = job.clientName?.trim() || null;
    const key = clientKey(email, name);
    if (!key) continue;

    let client = byKey.get(key) ?? (await findClientFor(email, name));
    if (!client) {
      client = await prisma.client.create({
        data: {
          name: name || email || "Unnamed client",
          email,
          phone: job.clientPhone || null,
          address: job.address || null,
        },
      });
      created++;
    }
    byKey.set(key, client);

    await prisma.job.update({ where: { id: job.id }, data: { clientId: client.id } });
    linked++;
  }
  return { created, linked };
}

/**
 * Resolves the Client an invoice for this job should bill: the COMPANY the
 * job belongs to when it has one, else a private client from the job's
 * site-contact details.
 */
export async function findOrCreateClientForJob(job: Job): Promise<Client | null> {
  if (job.companyId) {
    const company = await companyClientFor(job.companyId);
    if (company) {
      if (job.clientId !== company.id) {
        await prisma.job.update({ where: { id: job.id }, data: { clientId: company.id } });
      }
      return company;
    }
  }

  if (job.clientId) {
    const existing = await prisma.client.findUnique({ where: { id: job.clientId } });
    if (existing) return existing;
  }

  const email = job.clientEmail?.trim().toLowerCase() || null;
  const name = job.clientName?.trim() || null;
  if (!email && !name) return null;

  let client = await findClientFor(email, name);
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: name || email || "Unnamed client",
        email,
        phone: job.clientPhone || null,
        address: job.address || null,
      },
    });
  }
  await prisma.job.update({ where: { id: job.id }, data: { clientId: client.id } });
  return client;
}
