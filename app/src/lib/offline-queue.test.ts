import { describe, it, expect } from "vitest";
import { classifyMutationResponse, isAuthLapse } from "./offline-queue";

// P0-5: a lapsed session must never silently delete a queued on-site write. The
// middleware 307-redirects to /login; with redirect:"manual" that surfaces as an
// opaque response, and a followed redirect returns 405 — both used to be dropped.
describe("offline queue — mutation response classification (P0-5)", () => {
  const r = (status: number, extra: Partial<{ ok: boolean; type: string }> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    ...extra,
  });

  it("KEEPS a write (does not drop) when the session has lapsed", () => {
    expect(classifyMutationResponse({ ok: false, status: 0, type: "opaqueredirect" })).toBe("keep-auth");
    expect(classifyMutationResponse(r(401))).toBe("keep-auth");
    expect(classifyMutationResponse(r(403))).toBe("keep-auth");
    expect(classifyMutationResponse(r(405))).toBe("keep-auth"); // the old silent-loss path
  });

  it("deletes a write that genuinely succeeded", () => {
    expect(classifyMutationResponse(r(200))).toBe("delete-ok");
    expect(classifyMutationResponse(r(204))).toBe("delete-ok");
  });

  it("drops a genuine client-validation error that can never succeed", () => {
    expect(classifyMutationResponse(r(400))).toBe("drop");
    expect(classifyMutationResponse(r(409))).toBe("drop");
    expect(classifyMutationResponse(r(422))).toBe("drop");
  });

  it("retries transient failures (5xx, rate limit)", () => {
    expect(classifyMutationResponse(r(500))).toBe("retry");
    expect(classifyMutationResponse(r(502))).toBe("retry");
    expect(classifyMutationResponse(r(429))).toBe("retry");
  });

  it("isAuthLapse recognises opaque redirects and auth statuses only", () => {
    expect(isAuthLapse({ status: 0, type: "opaqueredirect" })).toBe(true);
    expect(isAuthLapse({ status: 401 })).toBe(true);
    expect(isAuthLapse({ status: 403 })).toBe(true);
    expect(isAuthLapse({ status: 405 })).toBe(true);
    expect(isAuthLapse({ status: 200 })).toBe(false);
    expect(isAuthLapse({ status: 400 })).toBe(false);
    expect(isAuthLapse({ status: 500 })).toBe(false);
  });
});
