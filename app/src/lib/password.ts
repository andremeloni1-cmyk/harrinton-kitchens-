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

/** Constant-time verify a plaintext password against a stored scrypt string. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
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
