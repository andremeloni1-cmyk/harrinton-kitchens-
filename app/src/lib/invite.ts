import crypto from "node:crypto";

// Team invites use a stored-hash token (the Invite model), distinct from the
// stateless signed tokens in token.ts. The raw token travels in the emailed
// link; only its SHA-256 hash is stored, so a DB leak doesn't expose live links.

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/**
 * Guard against locking everyone out: true when `userId` is the *only* active
 * ADMIN, so demoting or deactivating them must be blocked. Pure, so it's unit
 * tested and callable from the API layer.
 */
export function isLastActiveAdmin(
  users: { id: string; role: string; active: boolean }[],
  userId: string
): boolean {
  const activeAdmins = users.filter((u) => u.active && u.role === "ADMIN");
  return activeAdmins.length === 1 && activeAdmins[0].id === userId;
}
