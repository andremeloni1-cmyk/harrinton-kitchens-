import { prisma } from "@/lib/db";
import { json, createJobWithReference } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { DEFAULT_STATIONS } from "@/lib/factory";

export const dynamic = "force-dynamic";

const HEX = /^#?[0-9a-fA-F]{6}$/;

// Applies the onboarding wizard (P13.1): company identity + branding, the
// default station line (if none yet), an optional sample job, and marks the
// instance onboarded — so a fresh install is production-ready via the wizard.
export async function POST(req: Request) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;

  const body = await req.json().catch(() => ({}));
  const companyName = typeof body.companyName === "string" ? body.companyName.trim().slice(0, 120) : "";
  const accent = typeof body.accentColor === "string" && HEX.test(body.accentColor)
    ? (body.accentColor.startsWith("#") ? body.accentColor : `#${body.accentColor}`)
    : null;
  const seedSample = body.seedSample === true;

  const settings = await prisma.companySettings.findFirst();
  if (!settings) return json({ error: "No company settings row — run the seed/migrations first." }, 400);

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      ...(companyName ? { name: companyName } : {}),
      ...(accent ? { accentColor: accent } : {}),
      onboardedAt: settings.onboardedAt ?? new Date(),
    },
  });

  // Seed the default station line only if there are none.
  const stationCount = await prisma.station.count();
  if (stationCount === 0) {
    await prisma.$transaction(DEFAULT_STATIONS.map((name, i) => prisma.station.create({ data: { name, position: i } })));
  }

  let sampleJobId: string | null = null;
  if (seedSample) {
    const job = await createJobWithReference((reference) => ({
      reference,
      title: "Sample kitchen — Smith residence",
      description: "A demo job to explore the workflow. Delete it whenever you like.",
      pipelineStage: "ENQUIRY",
      status: "lead",
      priority: "normal",
      address: "1 Example Street",
      clientName: "Sample Client",
      leadSource: "sample",
      notes: "Created by the setup wizard as a guided tour.",
    }));
    sampleJobId = job.id;
  }

  return json({ ok: true, sampleJobId, stationsCreated: stationCount === 0 ? DEFAULT_STATIONS.length : 0 });
}
