import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

// Lightweight active-staff list for assignee pickers (consults, check measures).
// Available to anyone who can manage jobs — lighter than the admin-only /api/users.
export async function GET() {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const staff = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return json({ staff });
}
