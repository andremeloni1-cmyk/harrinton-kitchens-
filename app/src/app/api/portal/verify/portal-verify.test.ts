import { describe, it, expect, vi, beforeEach } from "vitest";

// P1-8: the portal magic link must be single-use — redeeming it consumes the
// token, so a forwarded/previewed link can't mint fresh sessions for its TTL.
const findFirst = vi.fn();
const deleteMany = vi.fn(async (..._a: unknown[]) => ({ count: 1 }));
vi.mock("@/lib/db", () => ({
  prisma: {
    clientPortalToken: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));
const setPortalCookie = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/portal-session", () => ({
  hashPortalToken: (t: string) => `h:${t}`,
  setPortalCookie: (...a: unknown[]) => setPortalCookie(...a),
}));

import { GET } from "./route";

const call = () => GET(new Request("http://t/api/portal/verify?token=abc"));

beforeEach(() => {
  findFirst.mockReset();
  deleteMany.mockReset().mockResolvedValue({ count: 1 });
  setPortalCookie.mockReset();
});

describe("portal magic-link is single-use (P1-8)", () => {
  it("consumes the token and signs the client in on first use", async () => {
    findFirst.mockResolvedValue({ id: "t1", clientId: "c1" });
    const res = await call();
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(setPortalCookie).toHaveBeenCalledWith("c1");
    expect(res.headers.get("location")).toMatch(/\/portal$/);
  });

  it("rejects a replay once the token is gone", async () => {
    findFirst.mockResolvedValue(null);
    const res = await call();
    expect(setPortalCookie).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toMatch(/error=link/);
  });

  it("rejects when the token was consumed concurrently (deleteMany removed 0)", async () => {
    findFirst.mockResolvedValue({ id: "t1", clientId: "c1" });
    deleteMany.mockResolvedValue({ count: 0 });
    const res = await call();
    expect(setPortalCookie).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toMatch(/error=link/);
  });
});
