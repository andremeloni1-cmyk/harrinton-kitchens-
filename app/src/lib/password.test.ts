import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { isRole, ROLES } from "./roles";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a correct password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("s3cret");
    expect(verifyPassword("guess", stored)).toBe(false);
  });

  it("produces a self-describing scrypt string with a unique salt each time", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a).not.toBe(b); // random salt → different hashes
    expect(verifyPassword("same", a)).toBe(true);
    expect(verifyPassword("same", b)).toBe(true);
  });

  it("returns false for null/empty/malformed stored values", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", undefined)).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "not-a-scrypt-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$16384$8$1$deadbeef")).toBe(false); // too few parts
  });
});

describe("isRole", () => {
  it("accepts every defined role", () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
  });
  it("rejects unknown or non-string values", () => {
    expect(isRole("SUPERUSER")).toBe(false);
    expect(isRole("admin")).toBe(false); // case-sensitive
    expect(isRole(null)).toBe(false);
    expect(isRole(123)).toBe(false);
  });
});
