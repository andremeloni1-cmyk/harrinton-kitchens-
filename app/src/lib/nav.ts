import type { Role } from "./roles";

// Four surfaces, one app: office (the jobs dashboard), factory, field, and the
// client portal (which has its own chrome). Each staff role lands on — and
// navigates within — its own surface. The concrete nav items (with icons) live
// in BottomNav; this module holds the pure, testable role→surface mapping.

/** Where a role lands after signing in, and when it hits "/". */
export function homeForRole(role: Role): string {
  switch (role) {
    case "FACTORY":
      return "/factory";
    case "INSTALLER":
      return "/field";
    case "DRIVER":
      return "/deliveries";
    default:
      return "/"; // ADMIN / OFFICE / DESIGNER → the jobs dashboard
  }
}

/**
 * Ordered primary-nav item keys per role (resolved to items in BottomNav).
 *
 * The office-side roles carry six items rather than five so Design can be added
 * without evicting anything — the owner's call. Factory and field stay at three:
 * they are used one-handed on a floor, and a crowded bar is a mis-tap.
 */
export const NAV_KEYS: Record<Role, string[]> = {
  ADMIN: ["jobs", "calendar", "design", "installers", "clients", "more"],
  OFFICE: ["jobs", "calendar", "design", "installers", "clients", "more"],
  DESIGNER: ["design", "jobs", "calendar", "clients", "reports", "more"],
  FACTORY: ["factory", "calendar", "more"],
  INSTALLER: ["field", "calendar", "more"],
  DRIVER: ["deliveries", "calendar", "more"],
};

/** Nav keys for a (possibly still-loading) role — falls back to the office set. */
export function navKeysFor(role: Role | null | undefined): string[] {
  return role ? NAV_KEYS[role] : NAV_KEYS.OFFICE;
}
