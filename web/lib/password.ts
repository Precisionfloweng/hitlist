import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt with a per-user random salt. Stored as "scrypt$<salt>$<hash>" in the Users tab.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = (stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 200) return "That's too long.";
  return null;
}
