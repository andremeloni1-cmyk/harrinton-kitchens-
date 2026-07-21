import { describe, it, expect } from "vitest";
import { hashInviteToken, newInviteToken, isLastActiveAdmin } from "./invite";

describe("invite tokens", () => {
  it("hashes deterministically", () => {
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
    expect(hashInviteToken("abc")).not.toBe(hashInviteToken("abd"));
    expect(hashInviteToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("mints a unique token whose hash matches", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(hashInviteToken(a.token)).toBe(a.tokenHash);
    expect(a.token).not.toBe(a.tokenHash); // the raw token is not the stored hash
  });
});

describe("isLastActiveAdmin", () => {
  const u = (id: string, role: string, active = true) => ({ id, role, active });

  it("is true for the only active admin", () => {
    const users = [u("1", "ADMIN"), u("2", "OFFICE"), u("3", "FACTORY")];
    expect(isLastActiveAdmin(users, "1")).toBe(true);
  });

  it("is false when another active admin exists", () => {
    const users = [u("1", "ADMIN"), u("2", "ADMIN")];
    expect(isLastActiveAdmin(users, "1")).toBe(false);
  });

  it("ignores inactive admins", () => {
    const users = [u("1", "ADMIN"), u("2", "ADMIN", false)];
    expect(isLastActiveAdmin(users, "1")).toBe(true); // 2 is inactive → 1 is the last
  });

  it("is false for a non-admin (nothing to protect)", () => {
    const users = [u("1", "ADMIN"), u("2", "OFFICE")];
    expect(isLastActiveAdmin(users, "2")).toBe(false);
  });
});
