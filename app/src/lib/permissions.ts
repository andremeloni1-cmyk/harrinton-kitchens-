import type { Role } from "./roles";

// Authorization matrix: which roles may perform each coarse-grained action.
// Kept pure and dependency-free so it can be used both server-side (route
// guards, see requirePermission in session.ts) and client-side (hiding nav the
// user can't use). Authentication (is there a session) is separate — this is
// authorization (what that user may do).
export type Permission =
  | "view" //            sign in / see the dashboard at all
  | "manage_jobs" //     create/edit jobs, scheduling, clients, documents
  | "edit_money" //      invoices, expenses, quotes/estimates, price list, P&L, Xero
  | "factory_board" //   factory board + hardware tracking
  | "field_app" //       installer / field surfaces
  | "manage_settings" // company settings, integrations, email templates
  | "manage_users" //    team management (invite, change role, deactivate)
  | "manage_loads" //    build and commit a truck's loading list
  | "deliver"; //        tick items onto the truck, capture proof of delivery

const MATRIX: Record<Permission, readonly Role[]> = {
  view: ["ADMIN", "OFFICE", "DESIGNER", "FACTORY", "INSTALLER", "DRIVER"],
  manage_jobs: ["ADMIN", "OFFICE", "DESIGNER"],
  edit_money: ["ADMIN", "OFFICE"],
  factory_board: ["ADMIN", "OFFICE", "FACTORY"],
  field_app: ["ADMIN", "OFFICE", "INSTALLER"],
  manage_settings: ["ADMIN"],
  manage_users: ["ADMIN"],
  // Deciding what should go is an office act; putting it on the truck and
  // proving it arrived is the floor's and the driver's.
  manage_loads: ["ADMIN", "OFFICE"],
  deliver: ["ADMIN", "OFFICE", "FACTORY", "DRIVER"],
};

/** Whether `user` (from getSessionUser) may perform `action`. Null → false. */
export function can(user: { role: Role } | null | undefined, action: Permission): boolean {
  if (!user) return false;
  return MATRIX[action].includes(user.role);
}

export const PERMISSIONS = Object.keys(MATRIX) as Permission[];
