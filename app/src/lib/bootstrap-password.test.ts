import { describe, it, expect } from "vitest";
import { resolveBootstrapPassword } from "./bootstrap-password";

// P0-7: the bootstrap scripts must never seed a static, source-visible admin
// password (the old "benchline-demo" default could reach production).
describe("resolveBootstrapPassword", () => {
  it("uses OWNER_PASSWORD verbatim when provided", () => {
    expect(resolveBootstrapPassword({ OWNER_PASSWORD: "a-real-password" })).toEqual({
      kind: "provided",
      password: "a-real-password",
    });
  });

  it("refuses in production when OWNER_PASSWORD is unset (no default credential)", () => {
    expect(resolveBootstrapPassword({ NODE_ENV: "production" })).toEqual({ kind: "refuse" });
  });

  it("generates a strong password in dev — never the old static default", () => {
    const r = resolveBootstrapPassword({ NODE_ENV: "development" });
    expect(r.kind).toBe("generated");
    if (r.kind === "generated") {
      expect(r.password).not.toBe("benchline-demo");
      expect(r.password.length).toBeGreaterThanOrEqual(16);
    }
  });

  it("generates a distinct password on each call", () => {
    const a = resolveBootstrapPassword({});
    const b = resolveBootstrapPassword({});
    expect(a.kind).toBe("generated");
    expect(b.kind).toBe("generated");
    if (a.kind === "generated" && b.kind === "generated") expect(a.password).not.toBe(b.password);
  });
});
