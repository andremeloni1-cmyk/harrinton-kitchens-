import { describe, it, expect, vi, beforeEach } from "vitest";

// P0-1: the installer portal exposes client names/addresses and the job
// pipeline. Logged out, both server pages must redirect to /login and must NOT
// read any client data from the database.
const getSessionUser = vi.fn();
vi.mock("@/lib/session", () => ({ getSessionUser: (...a: unknown[]) => getSessionUser(...a) }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const installerFindMany = vi.fn(async (..._a: unknown[]) => {
  throw new Error("prisma.installer.findMany must not run when logged out");
});
const installerFindUnique = vi.fn(async (..._a: unknown[]) => {
  throw new Error("prisma.installer.findUnique must not run when logged out");
});
vi.mock("@/lib/db", () => ({
  prisma: {
    installer: {
      findMany: (...a: unknown[]) => installerFindMany(...a),
      findUnique: (...a: unknown[]) => installerFindUnique(...a),
    },
  },
}));

import IndexPage from "./page";
import RunSheetPage from "./[installerId]/page";

beforeEach(() => {
  getSessionUser.mockReset();
  installerFindMany.mockClear();
  installerFindUnique.mockClear();
});

describe("installer portal requires a staff session (P0-1)", () => {
  it("index redirects to /login when logged out and never queries installers", async () => {
    getSessionUser.mockResolvedValue(null);
    await expect(IndexPage()).rejects.toThrow("REDIRECT:/login");
    expect(installerFindMany).not.toHaveBeenCalled();
  });

  it("run sheet redirects to /login when logged out and never queries installers", async () => {
    getSessionUser.mockResolvedValue(null);
    await expect(RunSheetPage({ params: Promise.resolve({ installerId: "i1" }) })).rejects.toThrow(
      "REDIRECT:/login"
    );
    expect(installerFindUnique).not.toHaveBeenCalled();
  });
});
