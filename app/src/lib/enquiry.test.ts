import { describe, it, expect } from "vitest";
import { validateEnquiry, isHoneypotTripped, sniffImageType, enquiryTitle } from "./enquiry";

describe("validateEnquiry", () => {
  it("accepts a name with an email or a phone", () => {
    expect(validateEnquiry({ name: "Sam Jones", email: "sam@example.com" }).ok).toBe(true);
    expect(validateEnquiry({ name: "Sam Jones", phone: "0400 000 000" }).ok).toBe(true);
  });

  it("requires a name", () => {
    const r = validateEnquiry({ name: " ", email: "sam@example.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/i);
  });

  it("requires at least one contact method", () => {
    const r = validateEnquiry({ name: "Sam Jones" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email or phone/i);
  });

  it("rejects an obviously malformed email", () => {
    expect(validateEnquiry({ name: "Sam", email: "not-an-email" }).ok).toBe(false);
    expect(validateEnquiry({ name: "Sam", email: "a@b.co" }).ok).toBe(true);
  });
});

describe("isHoneypotTripped", () => {
  it("is tripped only when the hidden field has content", () => {
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false);
    expect(isHoneypotTripped(undefined)).toBe(false);
    expect(isHoneypotTripped("http://spam.example")).toBe(true);
  });
});

describe("sniffImageType", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

  it("recognises real image magic bytes", () => {
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(gif)).toBe("image/gif");
  });

  it("rejects non-image and too-short buffers", () => {
    expect(sniffImageType(Buffer.from("hello world!!"))).toBe(null);
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBe(null);
  });
});

describe("enquiryTitle", () => {
  it("prefers the AI title, then the project type, then a fallback", () => {
    expect(enquiryTitle({ aiTitle: "Galley kitchen refit", projectType: "Kitchen" })).toBe("Galley kitchen refit");
    expect(enquiryTitle({ projectType: "Laundry" })).toBe("Laundry enquiry");
    expect(enquiryTitle({})).toBe("Website enquiry");
  });

  it("caps the title length", () => {
    expect(enquiryTitle({ aiTitle: "x".repeat(200) }).length).toBe(80);
  });
});
