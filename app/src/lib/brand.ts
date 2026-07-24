/**
 * Platform brand — the single source of truth for the product's own name and
 * identity strings.
 *
 * Two layers of naming, kept deliberately separate:
 *  - **Platform brand** (this file): the product itself. Used for the PWA install
 *    name, document `<title>`, system push notifications, backup filenames and as
 *    the fallback whenever no company name is set. Working name: "Benchline".
 *  - **Company brand** (`CompanySettings.name`, exposed via `/api/branding`): the
 *    joinery business running this instance. That is what clients and staff see in
 *    the header, on quote/handover PDFs and in emails.
 *
 * White-label a deployment by setting `APP_NAME` (server) and `NEXT_PUBLIC_APP_NAME`
 * (client chrome) in `.env` — no code change required. Never hardcode a product or
 * customer name in a component: import `BRAND`, or read the company name.
 */

// `NEXT_PUBLIC_APP_NAME` is inlined into the client bundle by Next; `APP_NAME` is
// server-only (undefined in the browser, which is fine — we fall through to the
// default). Reading both means one env var covers each rendering context.
const configuredName =
  process.env.NEXT_PUBLIC_APP_NAME || process.env.APP_NAME || "";

export const BRAND = {
  /** Platform product name (working name). Overridden per deployment by APP_NAME. */
  name: configuredName || "Benchline",
  /** Descriptor used in the PWA manifest and document metadata. */
  description:
    "The operating system for joinery companies — enquiry to handover in one workspace.",
  /** Tagline for hero / login surfaces. */
  tagline: "Joinery, end to end.",
} as const;

/** URL/file-safe slug of the platform brand name (for backup filenames etc.). */
export function brandSlug(): string {
  return (
    BRAND.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app"
  );
}

/**
 * Internal, non-user-visible identifiers. Per the BUILD_TASKS ground rule, storage
 * keys and third-party metadata keys may keep stable values behind a constant —
 * they must never carry a customer name, and they must not change casually (a
 * rename orphans existing offline queues / calendar tags). Kept brand-neutral.
 */
export const INTERNAL = {
  /** IndexedDB database backing the offline mutation queue. */
  offlineDbName: "joinery-offline",
  /** Google Calendar `extendedProperties.private` key tagging events we created. */
  calendarJobIdKey: "joineryJobId",
  /** Namespace prefix encoded into part QR labels so the factory scanner ignores
   * unrelated codes. Brand-neutral — the printer (labels.ts) and scanner
   * (FactoryScanner) both read it from here, so they can never drift apart. */
  qrPrefix: "PART:",
} as const;
