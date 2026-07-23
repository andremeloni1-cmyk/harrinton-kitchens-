import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { Role } from "./roles";

// A strong, non-placeholder secret so `secret()` uses it verbatim (rather than
// the dev fallback) and our forged cookies verify.
const SECRET = "test-session-secret-not-a-placeholder-0123456789";
process.env.SESSION_SECRET = SECRET;

// Controllable seams: the cookie the request carries, and the user the DB
// returns for that id. getSessionUser() reads the cookie (signature + expiry),
// then confirms the user is active with a matching credential epoch.
let cookieValue: string | undefined;
let dbUser: { id: string; name: string; email: string; role: string; active: boolean; credentialEpoch: number } | null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "jf_session" && cookieValue ? { value: cookieValue } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn(async () => dbUser) } },
}));

import { requirePermission, getSessionUser } from "./session";

/** Forge a validly-signed session cookie the way setSessionCookie would. */
function forge(userId: string, epoch: number, issuedAtMs = Date.now()): string {
  const value = `${userId}.${epoch}.${issuedAtMs}`;
  const h = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${h}`;
}

function signedInAs(role: Role, opts: { active?: boolean; epoch?: number } = {}) {
  const epoch = opts.epoch ?? 1;
  dbUser = { id: "u1", name: "T", email: "t@x.co", role, active: opts.active ?? true, credentialEpoch: epoch };
  cookieValue = forge("u1", epoch);
}

beforeEach(() => {
  cookieValue = undefined;
  dbUser = null;
});

describe("requirePermission", () => {
  it("returns 401 when there is no session cookie", async () => {
    const gate = await requirePermission("view");
    expect(gate).toBeInstanceOf(Response);
    expect((gate as Response).status).toBe(401);
  });

  it("returns 403 when the signed-in role lacks the permission", async () => {
    signedInAs("INSTALLER");
    const gate = await requirePermission("manage_settings");
    expect(gate).toBeInstanceOf(Response);
    expect((gate as Response).status).toBe(403);
  });

  it("returns the user when the role holds the permission", async () => {
    signedInAs("ADMIN");
    const gate = await requirePermission("manage_settings");
    expect(gate).not.toBeInstanceOf(Response);
    expect((gate as { role: Role }).role).toBe("ADMIN");
  });

  it("returns 403 for a non-manager role on manage_jobs", async () => {
    signedInAs("FACTORY");
    const gate = await requirePermission("manage_jobs");
    expect((gate as Response).status).toBe(403);
  });

  it("allows a DESIGNER on manage_jobs", async () => {
    signedInAs("DESIGNER");
    const gate = await requirePermission("manage_jobs");
    expect(gate).not.toBeInstanceOf(Response);
  });

  it("fails closed (401) for a deactivated user even with a valid cookie", async () => {
    signedInAs("ADMIN", { active: false });
    const gate = await requirePermission("view");
    expect((gate as Response).status).toBe(401);
  });

  it("fails closed (401) when the credential epoch no longer matches (reset/logout-all)", async () => {
    // Cookie was minted at epoch 1, but the user's epoch has since bumped to 2.
    dbUser = { id: "u1", name: "T", email: "t@x.co", role: "ADMIN", active: true, credentialEpoch: 2 };
    cookieValue = forge("u1", 1);
    const gate = await requirePermission("view");
    expect((gate as Response).status).toBe(401);
  });
});

describe("getSessionUser", () => {
  it("is null without a cookie", async () => {
    expect(await getSessionUser()).toBeNull();
  });
  it("rejects a tampered signature", async () => {
    signedInAs("ADMIN");
    cookieValue = cookieValue!.slice(0, -1) + (cookieValue!.endsWith("0") ? "1" : "0");
    expect(await getSessionUser()).toBeNull();
  });
});
