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

  it("P0-4 · PATCH /api/jobs/[id] requires manage_jobs", async () => {
    const { PATCH } = await import("./jobs/[id]/route");
    const req = new Request("http://t/api/jobs/j1", { method: "PATCH", body: "{}" });
    await expectGated("manage_jobs", () => PATCH(req, { params: Promise.resolve({ id: "j1" }) }));
  });

  it("P0-4 · DELETE /api/jobs/[id] requires manage_jobs", async () => {
    const { DELETE } = await import("./jobs/[id]/route");
    const req = new Request("http://t/api/jobs/j1", { method: "DELETE" });
    await expectGated("manage_jobs", () => DELETE(req, { params: Promise.resolve({ id: "j1" }) }));
  });

  const jobParam = { params: Promise.resolve({ id: "j1" }) };

  it("P2-A2 · POST /api/jobs/[id]/documents requires manage_jobs", async () => {
    const { POST } = await import("./jobs/[id]/documents/route");
    await expectGated("manage_jobs", () => POST(new Request("http://t", { method: "POST", body: "{}" }), jobParam));
  });
  it("P2-A2 · PATCH /api/jobs/[id]/documents requires manage_jobs", async () => {
    const { PATCH } = await import("./jobs/[id]/documents/route");
    await expectGated("manage_jobs", () => PATCH(new Request("http://t", { method: "PATCH", body: "{}" }), jobParam));
  });
  it("P2-A2 · DELETE /api/jobs/[id]/documents requires manage_jobs", async () => {
    const { DELETE } = await import("./jobs/[id]/documents/route");
    await expectGated("manage_jobs", () => DELETE(new Request("http://t?docId=d1", { method: "DELETE" }), jobParam));
  });

  it("P2-A1 · POST /api/jobs requires manage_jobs", async () => {
    const { POST } = await import("./jobs/route");
    await expectGated("manage_jobs", () => POST(new Request("http://t", { method: "POST", body: "{}" })));
  });

  it("P2-A3 · POST /api/installers requires manage_jobs", async () => {
    const { POST } = await import("./installers/route");
    await expectGated("manage_jobs", () => POST(new Request("http://t", { method: "POST", body: "{}" })));
  });

  it("P2-A4 · POST /api/lead-sources requires manage_settings", async () => {
    const { POST } = await import("./lead-sources/route");
    await expectGated("manage_settings", () => POST(new Request("http://t", { method: "POST", body: "{}" })));
  });

  it("P2-A5 · POST /api/jobs/[id]/photos requires manage_jobs", async () => {
    const { POST } = await import("./jobs/[id]/photos/route");
    await expectGated("manage_jobs", () => POST(new Request("http://t", { method: "POST", body: "{}" }), jobParam));
  });

  it("P2-A6 · POST /api/auth/xero/disconnect requires manage_settings", async () => {
    const { POST } = await import("./auth/xero/disconnect/route");
    await expectGated("manage_settings", () => POST());
  });

  it("P2-A7 · POST /api/hardware requires factory_board", async () => {
    const { POST } = await import("./hardware/route");
    await expectGated("factory_board", () => POST(new Request("http://t", { method: "POST", body: "{}" })));
  });
});
