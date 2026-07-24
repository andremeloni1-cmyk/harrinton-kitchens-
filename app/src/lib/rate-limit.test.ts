import { describe, it, expect } from "vitest";
import { checkRateLimit, type RateState } from "./rate-limit";

describe("checkRateLimit (P2-C1)", () => {
  const opts = (now: number) => ({ limit: 3, windowMs: 1000, now });

  it("allows up to the limit within a window", () => {
    const store = new Map<string, RateState>();
    expect(checkRateLimit(store, "k", opts(0)).ok).toBe(true); // 1
    expect(checkRateLimit(store, "k", opts(10)).ok).toBe(true); // 2
    const third = checkRateLimit(store, "k", opts(20));
    expect(third.ok).toBe(true); // 3
    expect(third.remaining).toBe(0);
  });

  it("blocks the attempt over the limit and reports a retry-after", () => {
    const store = new Map<string, RateState>();
    for (let i = 0; i < 3; i++) checkRateLimit(store, "k", opts(0));
    const blocked = checkRateLimit(store, "k", opts(400));
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1); // window resets at 1000ms, 600ms left → ceil = 1s
  });

  it("starts a fresh window once the old one elapses", () => {
    const store = new Map<string, RateState>();
    for (let i = 0; i < 3; i++) checkRateLimit(store, "k", opts(0));
    expect(checkRateLimit(store, "k", opts(999)).ok).toBe(false); // still in window
    const after = checkRateLimit(store, "k", opts(1000)); // window boundary → reset
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(2);
  });

  it("tracks keys independently", () => {
    const store = new Map<string, RateState>();
    for (let i = 0; i < 3; i++) checkRateLimit(store, "a", opts(0));
    expect(checkRateLimit(store, "a", opts(0)).ok).toBe(false);
    expect(checkRateLimit(store, "b", opts(0)).ok).toBe(true); // separate bucket
  });
});
