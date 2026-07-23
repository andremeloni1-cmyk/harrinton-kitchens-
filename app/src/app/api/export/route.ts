import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { BRAND, brandSlug } from "@/lib/brand";

export const dynamic = "force-dynamic";

// Full data export — a downloadable JSON backup of everything the owner has in
// the app, so their business data is never locked to the one server. Secrets
// (OAuth tokens, API keys) are deliberately excluded.
export async function GET() {
  // This is an owner-grade backup: the entire database (all jobs incl. document
  // bytes, all invoices, every client's PII). Restrict to ADMIN so a lower role
  // can't exfiltrate the whole company in one request.
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;

  const [jobs, invoices, clients, leadSources, priceItems, reports, account] = await Promise.all([
    prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      include: { documents: true, activities: true },
    }),
    prisma.invoice.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.client.findMany(),
    prisma.leadSource.findMany(),
    prisma.priceItem.findMany(),
    prisma.maintenanceReport.findMany(),
    prisma.companySettings.findFirst(),
  ]);

  const backup = {
    app: BRAND.name,
    exportedAt: new Date().toISOString(),
    version: 1,
    business: account ? { name: account.name, email: account.email, orgName: account.xeroOrgName } : null,
    counts: {
      jobs: jobs.length,
      invoices: invoices.length,
      clients: clients.length,
      priceItems: priceItems.length,
      reports: reports.length,
    },
    jobs,
    invoices,
    clients,
    leadSources,
    priceItems,
    reports,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${brandSlug()}-backup-${date}.json"`,
    },
  });
}
