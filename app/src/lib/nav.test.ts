import { describe, it, expect } from "vitest";
import { homeForRole, NAV_KEYS, navKeysFor } from "./nav";
import { ROLES } from "./roles";

describe("homeForRole", () => {
  it("sends factory and installer to their own surfaces", () => {
    expect(homeForRole("FACTORY")).toBe("/factory");
    expect(homeForRole("INSTALLER")).toBe("/field");
  });
  it("sends office roles to the dashboard", () => {
    expect(homeForRole("ADMIN")).toBe("/");
    expect(homeForRole("OFFICE")).toBe("/");
    expect(homeForRole("DESIGNER")).toBe("/");
  });
});

describe("NAV_KEYS", () => {
  it("defines a non-empty set for every role, always including More", () => {
    for (const role of ROLES) {
      expect(NAV_KEYS[role].length).toBeGreaterThan(0);
      expect(NAV_KEYS[role]).toContain("more");
    }
  });
  it("puts each role's home surface first", () => {
    expect(NAV_KEYS.FACTORY[0]).toBe("factory");
    expect(NAV_KEYS.INSTALLER[0]).toBe("field");
    expect(NAV_KEYS.OFFICE[0]).toBe("jobs");
  });
  it("keeps money/office surfaces out of the factory & installer navs", () => {
    for (const key of ["jobs", "installers", "clients"]) {
      expect(NAV_KEYS.FACTORY).not.toContain(key);
      expect(NAV_KEYS.INSTALLER).not.toContain(key);
    }
  });
  it("gives the office-side roles the design tab, leading for the designer", () => {
    for (const role of ["ADMIN", "OFFICE", "DESIGNER"] as const) {
      expect(NAV_KEYS[role]).toContain("design");
    }
    expect(NAV_KEYS.DESIGNER[0]).toBe("design");
  });
  it("keeps design off the factory and field bars", () => {
    expect(NAV_KEYS.FACTORY).not.toContain("design");
    expect(NAV_KEYS.INSTALLER).not.toContain("design");
  });
  it("holds every nav bar to six items — past that the targets get mis-tapped", () => {
    for (const role of ROLES) {
      expect(NAV_KEYS[role].length).toBeLessThanOrEqual(6);
    }
  });
  it("never repeats an item within a role's bar", () => {
    for (const role of ROLES) {
      expect(new Set(NAV_KEYS[role]).size).toBe(NAV_KEYS[role].length);
    }
  });
});

describe("navKeysFor", () => {
  it("falls back to the office set while the role is loading", () => {
    expect(navKeysFor(null)).toEqual(NAV_KEYS.OFFICE);
    expect(navKeysFor("FACTORY")).toEqual(NAV_KEYS.FACTORY);
  });
});
