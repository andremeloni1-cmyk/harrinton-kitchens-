import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { isRole } from "@/lib/roles";
import { isLastActiveAdmin } from "@/lib/invite";

export const dynamic = "force-dynamic";

// Change a user's role and/or active state. Guards against removing the last
// active admin (which would lock the whole company out).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("manage_users");
  if (gate instanceof Response) return gate;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return json({ error: "User not found" }, 404);

  const data: { role?: string; active?: boolean; credentialEpoch?: { increment: number } } = {};
  if (body.role !== undefined) {
    if (!isRole(body.role)) return json({ error: "Invalid role" }, 400);
    data.role = body.role;
  }
  if (typeof body.active === "boolean") data.active = body.active;
  if (data.role === undefined && data.active === undefined) {
    return json({ error: "Nothing to update" }, 400);
  }

  // Would this demote/deactivate the last active admin? Block it.
  const losingAdmin = data.active === false || (data.role !== undefined && data.role !== "ADMIN");
  if (losingAdmin) {
    const all = await prisma.user.findMany({ select: { id: true, role: true, active: true } });
    if (isLastActiveAdmin(all, id)) {
      return json({ error: "You can't remove the last active admin — promote someone else first" }, 400);
    }
  }

  // Deactivating invalidates that user's sessions immediately (getSessionUser
  // already rejects inactive users; bumping the epoch also stops a stale cookie
  // working again if they're later reactivated). Role changes apply live.
  if (data.active === false) data.credentialEpoch = { increment: 1 };

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return json({ user });
}
