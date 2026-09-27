// Sign-in: email + password. The emailed 6-digit code is only used the first time
// (to set a password) and when someone forgets it.
import "server-only";
import { createHash, randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureHeader, readTab, updateRow } from "./sheets";
import { checkPassword, hashPassword, passwordProblem } from "./password";

export type User = { email: string; name: string; role: "admin" | "tech" | "viewer"; hasPassword: boolean };

const SESSION = "hl_session";
const PENDING = "hl_pending";
const SESSION_YEARS = 10;          // effectively "stay signed in"; access is re-checked on every request
const CODE_MINUTES = 10;
const MAX_TRIES = 5;

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is not set (needs 16+ characters)");
  return new TextEncoder().encode(s);
}

const hashCode = (email: string, code: string) =>
  createHash("sha256").update(`${email}:${code}:${process.env.SESSION_SECRET}`).digest("hex");

const cookieOpts = (maxAgeSeconds: number) => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const,
  path: "/", maxAge: maxAgeSeconds,
});

async function userRow(email: string, fresh = false) {
  const e = email.trim().toLowerCase();
  const rows = await readTab("Users", fresh);
  return rows.find((r) => r.email.trim().toLowerCase() === e);
}

function toUser(u: Record<string, string>): User | null {
  if (["no", "false", "0"].includes((u.active || "").toLowerCase())) return null;
  const role = (["admin", "tech", "viewer"].includes(u.role) ? u.role : "tech") as User["role"];
  return { email: u.email.trim().toLowerCase(), name: u.name || u.email, role, hasPassword: !!u.password_hash };
}

/** Active user from the Users tab, or null. */
export async function findUser(email: string): Promise<User | null> {
  const u = await userRow(email);
  return u ? toUser(u) : null;
}

async function startSession(email: string) {
  const token = await new SignJWT({ email }).setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_YEARS * 365}d`).sign(key());
  (await cookies()).set(SESSION, token, cookieOpts(SESSION_YEARS * 365 * 86400));
}

// ---- password sign-in -----------------------------------------------------------------
const failures = new Map<string, { n: number; until: number }>();

export async function signInWithPassword(email: string, password: string): Promise<"ok" | "wrong" | "no-password" | "locked"> {
  const e = email.trim().toLowerCase();
  const f = failures.get(e);
  if (f && f.until > Date.now()) return "locked";
  const row = await userRow(e, true);
  const user = row ? toUser(row) : null;
  if (user && !row!.password_hash) return "no-password";
  if (!user || !checkPassword(password, row!.password_hash)) {
    const n = (f?.n ?? 0) + 1;
    failures.set(e, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return "wrong";
  }
  failures.delete(e);
  await startSession(user.email);
  return "ok";
}

// ---- emailed code (first time / forgot password) ---------------------------------------
export async function startSignIn(email: string): Promise<string | null> {
  const user = await findUser(email);
  if (!user) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = await new SignJWT({ email: user.email, h: hashCode(user.email, code), tries: 0 })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${CODE_MINUTES}m`).sign(key());
  (await cookies()).set(PENDING, token, cookieOpts(CODE_MINUTES * 60));
  return code;
}

export async function finishSignIn(code: string): Promise<"ok" | "wrong" | "expired"> {
  const jar = await cookies();
  const pending = jar.get(PENDING)?.value;
  if (!pending) return "expired";
  let payload: { email: string; h: string; tries: number };
  try {
    payload = (await jwtVerify(pending, key())).payload as typeof payload;
  } catch {
    return "expired";
  }
  if (payload.tries >= MAX_TRIES) return "expired";
  if (hashCode(payload.email, code.trim()) !== payload.h) {
    const again = await new SignJWT({ ...payload, tries: payload.tries + 1 })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${CODE_MINUTES}m`).sign(key());
    jar.set(PENDING, again, cookieOpts(CODE_MINUTES * 60));
    return "wrong";
  }
  const user = await findUser(payload.email);
  if (!user) return "expired";
  await startSession(user.email);
  jar.delete(PENDING);
  return "ok";
}

export async function setPassword(user: User, password: string): Promise<string | null> {
  const problem = passwordProblem(password);
  if (problem) return problem;
  await ensureHeader("Users");
  const row = await userRow(user.email, true);
  if (!row) return "User not found";
  await updateRow("Users", row._row, { ...row, password_hash: hashPassword(password) });
  return null;
}

export async function signOut() {
  (await cookies()).delete(SESSION);
}

/** Current user, re-checked against the Users tab so removed people lose access right away. */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return await findUser(String(payload.email));
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!u.hasPassword) redirect("/account/password");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/projects");
  return u;
}
