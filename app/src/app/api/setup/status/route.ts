import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { isGoogleConnected } from "@/lib/google/oauth";
import { isXeroConnected } from "@/lib/xero/oauth";

export const dynamic = "force-dynamic";

// First-run setup status (P13.1). needsSetup drives the one-time redirect to the
// wizard: a truly fresh instance (never onboarded, no stations) — existing
// instances are never disturbed.
export async function GET() {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;

  const [settings, stationCount, adminCount, google, xero] = await Promise.all([
    prisma.companySettings.findFirst({ select: { name: true, accentColor: true, onboardedAt: true } }),
    prisma.station.count(),
    prisma.user.count({ where: { role: "ADMIN", active: true } }),
    isGoogleConnected().catch(() => false),
    isXeroConnected().catch(() => false),
  ]);

  return json({
    needsSetup: !settings?.onboardedAt && stationCount === 0,
    onboarded: Boolean(settings?.onboardedAt),
    companyName: settings?.name ?? "",
    accentColor: settings?.accentColor ?? "",
    stationCount,
    hasAdmin: adminCount > 0,
    googleConnected: google,
    xeroConnected: xero,
  });
}
