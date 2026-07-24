import { describe, it, expect, vi } from "vitest";

// Pure helpers only — stub the prisma import so the module loads without a client.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { emailDomain } from "./utils";

describe("emailDomain (P3-2)", () => {
  it("returns the domain part of a full address", () => {
    expect(emailDomain("greg@acme.com.au")).toBe("acme.com.au");
  });

  it("passes a bare domain through unchanged", () => {
    expect(emailDomain("acme.com.au")).toBe("acme.com.au");
  });

  it("lower-cases and trims", () => {
    expect(emailDomain("  Greg@ACME.com  ")).toBe("acme.com");
  });

  it("uses the last @ so a plus/alias local part can't fool it", () => {
    expect(emailDomain("greg+jobs@acme.com")).toBe("acme.com");
  });

  it("lets a source configured either way match a sender's domain", () => {
    const senderDomain = emailDomain("no-reply@acme.com"); // as derived from the From header
    // A LeadSource stored as a bare domain OR as a full contact address both match.
    expect(senderDomain.includes(emailDomain("acme.com"))).toBe(true);
    expect(senderDomain.includes(emailDomain("greg@acme.com"))).toBe(true);
  });
});
