import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Permission } from "@/lib/permissions";

// Authorization contract for the API routes. Every route below must refuse a
// session that lacks the required permission by returning the guard's Response
// (403) instead of doing its work. We mock `@/lib/session` so the guard is a
// controllable seam: when it returns a 403 Response the handler must return it
// unchanged, and it must ask for the correct permission. `requirePermission`'s
// own role→verdict logic is covered separately in `src/lib/session.test.ts`.
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(),
  isAuthenticated: vi.fn(async () => true),
  getSessionUser: vi.fn(async () => null),
}));

import { requirePermission } from "@/lib/session";

const mockRequire = vi.mocked(requirePermission);
const forbidden = () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });

/** Assert `handler` is gated: when the guard denies, the route returns 403 and
 *  asked for `permission`. */
async function expectGated(
  permission: Permission,
  handler: () => Promise<Response>
): Promise<void> {
  mockRequire.mockReset();
  mockRequire.mockResolvedValue(forbidden());
  const res = await handler();
  expect(res.status).toBe(403);
  expect(mockRequire).toHaveBeenCalledWith(permission);
}

beforeEach(() => {
  mockRequire.mockReset();
});

describe("API authorization gates", () => {
  it("P0-3 · GET /api/export requires manage_settings", async () => {
    const { GET } = await import("./export/route");
    await expectGated("manage_settings", () => GET());
  });

  it("P0-2 · PATCH /api/settings requires manage_settings", async () => {
    const { PATCH } = await import("./settings/route");
    const req = new Request("http://t/api/settings", { method: "PATCH", body: "{}" });
    await expectGated("manage_settings", () => PATCH(req));
  });
});
