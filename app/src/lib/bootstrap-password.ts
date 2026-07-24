import crypto from "node:crypto";

// How to source the very first admin password when bootstrapping per-user auth
// (prisma/seed.ts and prisma/ensure-admin.ts). The one rule: never fall back to
// a static, source-visible default — that would let a public deploy come up
// with a known admin credential.
export type PasswordResolution =
  | { kind: "provided"; password: string } // OWNER_PASSWORD was set — use it
  | { kind: "generated"; password: string } // dev/demo — random one-time password
  | { kind: "refuse" }; //                     production with no OWNER_PASSWORD

/**
 * Resolve the bootstrap admin password:
 *  - OWNER_PASSWORD set          → use it verbatim.
 *  - unset in production          → refuse (the caller must exit / skip); never
 *                                   mint a default credential on a public deploy.
 *  - unset elsewhere (dev/demo)   → generate a random, single-use password the
 *                                   caller prints once.
 */
export function resolveBootstrapPassword(
  env: { OWNER_PASSWORD?: string; NODE_ENV?: string } = process.env
): PasswordResolution {
  const provided = env.OWNER_PASSWORD;
  if (provided) return { kind: "provided", password: provided };
  if (env.NODE_ENV === "production") return { kind: "refuse" };
  return { kind: "generated", password: crypto.randomBytes(18).toString("base64url") };
}
