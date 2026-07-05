import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

// Full data export — a downloadable JSON backup of everything the owner has in
// the app, so their business data is never locked to the one server. Secrets
// (OAuth tokens, API keys) are deliberately excluded.
export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);

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
    prisma.account.findFirst(),
  ]);

  const backup = {
    app: "Harrington Kitchens",
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
      "content-disposition": `attachment; filename="harringtonkitchens-backup-${date}.json"`,
    },
  });
}
