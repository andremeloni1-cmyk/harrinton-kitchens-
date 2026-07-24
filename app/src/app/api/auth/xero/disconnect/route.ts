import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { disconnectXero } from "@/lib/xero/oauth";

export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  await disconnectXero();
  return json({ ok: true });
}
