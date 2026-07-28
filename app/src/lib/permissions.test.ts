import { describe, it, expect } from "vitest";
import { can, PERMISSIONS, type Permission } from "./permissions";
import { ROLES, type Role } from "./roles";

// The authoritative expectation of the matrix, asserted role-by-role so a change
// to permissions.ts must be a deliberate change here too.
const EXPECTED: Record<Permission, Role[]> = {
  view: ["ADMIN", "OFFICE", "DESIGNER", "FACTORY", "INSTALLER", "DRIVER"],
  manage_jobs: ["ADMIN", "OFFICE", "DESIGNER"],
  edit_money: ["ADMIN", "OFFICE"],
  factory_board: ["ADMIN", "OFFICE", "FACTORY"],
  field_app: ["ADMIN", "OFFICE", "INSTALLER"],
  manage_settings: ["ADMIN"],
  manage_users: ["ADMIN"],
  manage_loads: ["ADMIN", "OFFICE"],
  deliver: ["ADMIN", "OFFICE", "FACTORY", "DRIVER"],
};

describe("can() — full matrix, every role × every permission", () => {
  for (const perm of PERMISSIONS) {
    for (const role of ROLES) {
      const allowed = EXPECTED[perm].includes(role);
      it(`${role} ${allowed ? "can" : "cannot"} ${perm}`, () => {
        expect(can({ role }, perm)).toBe(allowed);
      });
    }
  }
});

describe("can() — edge cases", () => {
  it("denies a null/undefined user everything", () => {
    for (const perm of PERMISSIONS) {
      expect(can(null, perm)).toBe(false);
      expect(can(undefined, perm)).toBe(false);
    }
  });

  it("keeps money and user management off-limits to FACTORY and INSTALLER", () => {
    expect(can({ role: "FACTORY" }, "edit_money")).toBe(false);
    expect(can({ role: "INSTALLER" }, "edit_money")).toBe(false);
    expect(can({ role: "FACTORY" }, "manage_users")).toBe(false);
    expect(can({ role: "OFFICE" }, "manage_users")).toBe(false);
  });
});
