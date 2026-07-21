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
    default:
      return "/"; // ADMIN / OFFICE / DESIGNER → the jobs dashboard
  }
}

/** Ordered primary-nav item keys per role (resolved to items in BottomNav). */
export const NAV_KEYS: Record<Role, string[]> = {
  ADMIN: ["jobs", "calendar", "installers", "clients", "more"],
  OFFICE: ["jobs", "calendar", "installers", "clients", "more"],
  DESIGNER: ["jobs", "calendar", "clients", "reports", "more"],
  FACTORY: ["factory", "calendar", "more"],
  INSTALLER: ["field", "calendar", "more"],
};

/** Nav keys for a (possibly still-loading) role — falls back to the office set. */
export function navKeysFor(role: Role | null | undefined): string[] {
  return role ? NAV_KEYS[role] : NAV_KEYS.OFFICE;
}
