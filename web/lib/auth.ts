// Sign-in with a 6-digit code emailed to the user. No passwords stored anywhere.
import "server-only";
import { createHash, randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readTab } from "./sheets";

export type User = { email: string; name: string; role: "admin" | "tech" | "viewer" };

const SESSION = "hl_session";
const PENDING = "hl_pending";
const SESSION_DAYS = 90;
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

/** Active user from the Users tab, or null. */
export async function findUser(email: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  const rows = await readTab("Users");
  const u = rows.find((r) => r.email.trim().toLowerCase() === e);
  if (!u || ["no", "false", "0"].includes((u.active || "").toLowerCase())) return null;
  const role = (["admin", "tech", "viewer"].includes(u.role) ? u.role : "tech") as User["role"];
  return { email: e, name: u.name || e, role };
}

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
  const session = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${SESSION_DAYS}d`).sign(key());
  jar.set(SESSION, session, cookieOpts(SESSION_DAYS * 86400));
  jar.delete(PENDING);
  return "ok";
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
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/projects");
  return u;
}
