// User roles. SQLite has no native enum type, so the role is stored as a String
// column (like Job.status) and constrained here at the application layer.
//
//  ADMIN     — full access, incl. user management and all money
//  OFFICE    — sales/admin: jobs, money, scheduling, clients
//  DESIGNER  — drawings, revisions, sign-off (design stage)
//  FACTORY   — the factory board and stations
//  INSTALLER — the field app / installer portal
//  DRIVER    — the truck: loading lists and proof of delivery
export const ROLES = ["ADMIN", "OFFICE", "DESIGNER", "FACTORY", "INSTALLER", "DRIVER"] as const;

export type Role = (typeof ROLES)[number];

/** Runtime guard — validate an untrusted string before storing it as a role. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Human-readable label for a role (UI). */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  OFFICE: "Office",
  DESIGNER: "Designer",
  FACTORY: "Factory",
  INSTALLER: "Installer",
  DRIVER: "Driver",
};

/** The default role granted to a newly-invited user when none is specified. */
export const DEFAULT_ROLE: Role = "OFFICE";
