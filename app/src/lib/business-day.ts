import { businessTimeZone } from "./schedule";

/**
 * Render an instant as a 'YYYY-MM-DD' calendar day in the BUSINESS timezone
 * (BUSINESS_TZ, default Australia/Sydney) — never the server's UTC day.
 *
 * Deriving "today" with `new Date().toISOString().slice(0,10)` on a UTC VPS
 * yields yesterday's date until ~10–11am Sydney, so the schedule board, business
 * snapshot and risk engine would show last week's grid every weekday morning.
 * This is the same tz-correct pattern already used in src/lib/xero/invoices.ts.
 *
 * Note: this is for deriving a day from a REAL instant (e.g. the current time).
 * It is NOT for the app's "floating" wall-clock fields (scheduledStart et al.),
 * which encode a local wall time and must not be tz-shifted.
 */
export function businessYMD(d: Date = new Date(), tz: string = businessTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
