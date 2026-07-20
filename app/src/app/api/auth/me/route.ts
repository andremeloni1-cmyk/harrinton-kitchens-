import { json } from "@/lib/utils";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// The current signed-in staff user (id, name, email, role), or 401. Used by the
// client to show who's logged in and to hide nav they can't access.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ user });
}
