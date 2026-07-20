import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { syncFromCalendar } from "@/lib/automations";

export const dynamic = "force-dynamic";

// Pull changes made directly in Google Calendar (jobs moved to another day) back
// into the app so they don't drift.
export async function POST() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  try {
    const result = await syncFromCalendar();
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, 500);
  }
}
