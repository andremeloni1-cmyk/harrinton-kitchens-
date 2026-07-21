import { describe, it, expect } from "vitest";
import { hashPortalToken, newPortalToken } from "./portal-session";

describe("portal magic-link tokens", () => {
  it("hashes deterministically to 64 hex chars", () => {
    expect(hashPortalToken("abc")).toBe(hashPortalToken("abc"));
    expect(hashPortalToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPortalToken("abc")).not.toBe(hashPortalToken("abd"));
  });

  it("mints a unique token whose stored hash matches (and isn't the raw token)", () => {
    const a = newPortalToken();
    const b = newPortalToken();
    expect(a.token).not.toBe(b.token);
    expect(hashPortalToken(a.token)).toBe(a.tokenHash);
    expect(a.tokenHash).not.toBe(a.token);
  });
});
