import { describe, it, expect, beforeAll } from "vitest";
import { signToken, verifyToken } from "./token";

// signToken/verifyToken read SESSION_SECRET; set a real one so we exercise the
// signing path rather than the dev fallback.
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-".padEnd(48, "x");
});

describe("signToken / verifyToken", () => {
  it("round-trips a payload", () => {
    const t = signToken("reset:user_123:0", 60_000);
    expect(t).toBeTruthy();
    expect(verifyToken(t)).toBe("reset:user_123:0");
  });

  it("rejects a tampered token", () => {
    const t = signToken("reset:user_123:0", 60_000)!;
    const tampered = t.slice(0, -2) + (t.endsWith("00") ? "11" : "00");
    expect(verifyToken(tampered)).toBeNull();
  });

  it("rejects a swapped payload with the original signature", () => {
    const t = signToken("reset:user_123:0", 60_000)!;
    const [, exp, sig] = t.split(".");
    const forged = `${Buffer.from("reset:attacker:0", "utf8").toString("base64url")}.${exp}.${sig}`;
    expect(verifyToken(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = signToken("x", -1_000); // already expired
    expect(verifyToken(t)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyToken(null)).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("a.b")).toBeNull();
    expect(verifyToken("a.b.c.d")).toBeNull();
  });
});
