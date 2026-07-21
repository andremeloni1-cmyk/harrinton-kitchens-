import { redirect } from "next/navigation";
import { Dashboard } from "./dashboard";
import { jobListQuery } from "@/lib/job-list";
import type { JobDTO } from "@/lib/job";
import { getSessionUser } from "@/lib/session";
import { homeForRole } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// Always render with live data — the job list changes throughout the day.
export const dynamic = "force-dynamic";

// Server-render the initial job list so the dashboard paints with real data
// instead of a skeleton. Middleware has already gated this route, so no auth
// check is needed here. If the query fails, the client falls back to fetching
// /api/jobs itself (and shows its retry card if that fails too).
export default async function DashboardPage() {
  // Factory/installer roles have their own home surface — bounce them there so
  // "/" always lands each role somewhere useful.
  const user = await getSessionUser();
  if (user) {
    const home = homeForRole(user.role);
    if (home !== "/") redirect(home);
    // First run: an admin on a brand-new instance is sent to the setup wizard.
    if (can(user, "manage_settings")) {
      const [settings, stations] = await Promise.all([
        prisma.companySettings.findFirst({ select: { onboardedAt: true } }),
        prisma.station.count(),
      ]);
      if (!settings?.onboardedAt && stations === 0) redirect("/setup");
    }
  }

  let initialJobs: JobDTO[] | null = null;
  try {
    // Round-trip through JSON to match the /api/jobs wire format (ISO dates).
    initialJobs = JSON.parse(JSON.stringify(await jobListQuery()));
  } catch {
    /* fall back to client-side loading */
  }
  return <Dashboard initialJobs={initialJobs} />;
}
