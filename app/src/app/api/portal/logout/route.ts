import { json } from "@/lib/utils";
import { clearPortalCookie } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearPortalCookie();
  return json({ ok: true });
}
