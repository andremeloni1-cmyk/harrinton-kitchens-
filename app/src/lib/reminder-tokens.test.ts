import { describe, expect, it } from "vitest";
import { mintToken, consumeToken } from "@/lib/reminder-tokens";

const T0 = 1_000_000;

describe("reminder tokens", () => {
  it("consumes a minted token exactly once", () => {
    const t = mintToken("inv-1", T0);
    expect(consumeToken(t, "inv-1", T0 + 1000)).toBe(true);
    // The double-tap: same token again is refused.
    expect(consumeToken(t, "inv-1", T0 + 2000)).toBe(false);
  });

  it("refuses a token for a different invoice", () => {
    const t = mintToken("inv-1", T0);
    expect(consumeToken(t, "inv-2", T0 + 1000)).toBe(false);
    // Mis-scoped use still burns it — it can't be replayed on the right scope.
    expect(consumeToken(t, "inv-1", T0 + 2000)).toBe(false);
  });

  it("refuses unknown and expired tokens", () => {
    expect(consumeToken("nope", "inv-1", T0)).toBe(false);
    const t = mintToken("inv-1", T0);
    expect(consumeToken(t, "inv-1", T0 + 16 * 60 * 1000)).toBe(false);
  });
});
