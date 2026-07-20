import { json, timingSafeEqualStr } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { scanForLeads } from "@/lib/leads";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

// Allow either a logged-in user (manual "Check now") or the cron job
// (presents the shared CRON_SECRET) to trigger an inbox scan.
async function authorized(req: Request): Promise<boolean> {
  if (await isAuthenticated()) return true;
  const secret = process.env.CRON_SECRET;
  if (secret && timingSafeEqualStr(req.headers.get("x-cron-secret"), secret)) return true;
  return false;
}

// A forced re-scan re-runs Claude vision over every email in the window, which
// costs real API credits. Throttle forced scans to once per this interval so a
// held-down button (or a script) can't burn credits in a loop.
let lastForceScan = 0;
const FORCE_COOLDOWN_MS = 60_000;

export async function POST(req: Request) {
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);
  // A logged-in user can force a re-scan (re-check emails already processed);
  // the cron never forces, so non-job emails aren't re-run through AI repeatedly.
  let force = (await isAuthenticated()) && new URL(req.url).searchParams.get("force") === "1";
  if (force) {
    const now = Date.now();
    // Date.now can be non-monotonic; treat a future lastForceScan as expired.
    if (now - lastForceScan < FORCE_COOLDOWN_MS && lastForceScan <= now) {
      force = false; // fall back to a cheap, deduped scan instead of re-running AI
    } else {
      lastForceScan = now;
    }
  }
  try {
    // Manual checks look back a month so older/dismissed emails can return;
    // the scheduled Friday run only scans the past week's batch.
    const result = await scanForLeads({ force, sinceDays: force ? 30 : 14 });

    // Notify subscribed devices when the (especially scheduled) scan turns up work.
    if (result.connected && (result.created > 0 || result.flagged > 0)) {
      const parts: string[] = [];
      if (result.created) parts.push(`${result.created} new to confirm`);
      if (result.plans) parts.push(`${result.plans} plans arrived`);
      if (result.flagged) parts.push(`${result.flagged} to review`);
      await sendPush({ title: `${BRAND.name} — inbox checked`, body: parts.join(" · "), url: "/" }).catch(() => {});
    }

    return json({ ok: true, ...result });
  } catch (e) {
    // Log the detail server-side; don't leak internal error text to the client.
    console.error("leads/scan failed:", e);
    return json({ ok: false, error: "Couldn't check the inbox just now." }, 500);
  }
}
