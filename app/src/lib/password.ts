import crypto from "node:crypto";

// Password hashing with scrypt (Node built-in — no external dependency).
// The stored format carries its own parameters so they can evolve without a
// migration:  scrypt$N$r$p$<saltHex>$<hashHex>
//
// scrypt is memory-hard; N=16384,r=8,p=1 uses ~16MB per hash (well within
// Node's 32MB default) and is comfortably fast enough for interactive login.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALTLEN = 16;

/** Hash a plaintext password into a self-describing scrypt string. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALTLEN);
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

// A throwaway hash of an unguessable value, used only to spend the same scrypt
// time on the missing-user path as on a real (wrong-password) verify — see
// verifyPassword. Computed lazily so importing this module stays cheap.
let dummyHash: string | null = null;
function getDummyHash(): string {
  if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(32).toString("hex"));
  return dummyHash;
}

/** Constant-time verify a plaintext password against a stored scrypt string. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  // No user / no password on file: still run one scrypt (against a dummy hash
  // that never matches) so a nonexistent account can't be told apart from a
  // wrong password by response timing — an account-enumeration defence (P3-19).
  if (!stored) stored = getDummyHash();
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (![n, r, p].every(Number.isFinite)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = crypto.scryptSync(password, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// --- password policy (P3-20) ------------------------------------------------

/** Minimum length for a user-chosen password. 10 raises the brute-force cost
 * meaningfully over the old 8 while staying easy to satisfy. */
export const MIN_PASSWORD_LENGTH = 10;

// The handful of passwords guessers always try first. Not an exhaustive list —
// scrypt and the length floor carry the real weight — but it turns away the
// obvious ones. Matched case-insensitively.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssword",
  "1234567890", "12345678", "123456789", "qwertyuiop", "qwerty123", "1q2w3e4r",
  "letmein", "welcome", "welcome1", "iloveyou", "changeme", "trustno1",
  "sunshine", "princess", "football", "baseball", "michael", "superman",
  "admin123", "administrator",
]);

/**
 * Validate a chosen password against the policy. Returns a human-readable
 * problem string when it's unacceptable, or null when it's fine — so callers can
 * `const problem = passwordProblem(pw); if (problem) return json({ error: problem }, 400);`.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common — please choose a less predictable one";
  }
  return null;
}
