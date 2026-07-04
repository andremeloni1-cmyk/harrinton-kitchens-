import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { disconnectXero } from "@/lib/xero/oauth";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  await disconnectXero();
  return json({ ok: true });
}
