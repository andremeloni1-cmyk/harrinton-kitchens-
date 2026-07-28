import { describe, it, expect } from "vitest";
import { invoiceRecipient, REMINDER_TEMPLATE_KEY } from "./invoice-email";

describe("invoiceRecipient", () => {
  it("prefers the client record's address over the job's site contact", () => {
    expect(invoiceRecipient("accounts@builder.com", "jane@example.com")).toBe("accounts@builder.com");
  });

  it("falls back to the site contact for direct work", () => {
    expect(invoiceRecipient(null, "jane@example.com")).toBe("jane@example.com");
    expect(invoiceRecipient(undefined, "jane@example.com")).toBe("jane@example.com");
  });

  it("treats whitespace as absent rather than sending to a blank address", () => {
    expect(invoiceRecipient("   ", "jane@example.com")).toBe("jane@example.com");
    expect(invoiceRecipient("  accounts@builder.com  ", null)).toBe("accounts@builder.com");
  });

  it("returns empty when there is nobody to send to, so the caller must ask", () => {
    expect(invoiceRecipient(null, null)).toBe("");
    expect(invoiceRecipient("", "")).toBe("");
  });
});

describe("REMINDER_TEMPLATE_KEY", () => {
  it("matches the seeded template key", () => {
    // The seed creates this key; a rename here without one there would leave
    // reminderEmailDefaults returning null and the sheet refusing to open.
    expect(REMINDER_TEMPLATE_KEY).toBe("payment_reminder");
  });
});
