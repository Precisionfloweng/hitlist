// Sign-in: email + password. The emailed 6-digit code is only used the first time
// (to set a password) and when someone forgets it.
import "server-only";
import { createHash, randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { appendRows, ensureHeader, ensureTab, readTab, updateCell, updateRow } from "./sheets";
import { checkPassword, hashPassword, passwordProblem } from "./password";

// role "owner" in the Users tab = an admin who can't be removed, turned off or demoted from the site.
// role "customer" = an outside person who sees only the projects listed for them, read-only.
export type User = { email: string; name: string; role: "admin" | "tech" | "viewer" | "customer"; owner: boolean;
  hasPassword: boolean; projects: string[] };

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
  const owner = u.role === "owner";
  const role = (owner ? "admin" : ["admin", "tech", "viewer", "customer"].includes(u.role) ? u.role : "tech") as User["role"];
  const projects = (u.projects || "").split("|").map((x) => x.trim()).filter(Boolean);
  return { email: u.email.trim().toLowerCase(), name: u.name || u.email, role, owner, projects,
    hasPassword: !!u.password_hash };
}

/** Active user from the Users tab, or null. */
export async function findUser(email: string): Promise<User | null> {
  const u = await userRow(email);
  return u ? toUser(u) : null;
}

async function startSession(user: User, method: "password" | "emailed code") {
  const token = await new SignJWT({ email: user.email }).setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_YEARS * 365}d`).sign(key());
  (await cookies()).set(SESSION, token, cookieOpts(SESSION_YEARS * 365 * 86400));
  await logSignIn(user, method);
}

/** "iPad · Safari", "Windows · Chrome"… from the browser's user-agent string. */
function deviceOf(ua: string): string {
  const os = /iPad|Macintosh.*Mobile/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : "Other";
  return `${os} · ${browser}`;
}

/** Add a row to the SignIns tab. Never blocks signing in if the sheet can't be written. */
async function logSignIn(user: User, method: string) {
  try {
    const at = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(",", "");
    const ua = (await headers()).get("user-agent") || "";
    await ensureTab("SignIns");
    await appendRows("SignIns", [{ signed_in_at: at, email: user.email, name: user.name,
      role: user.owner ? "owner" : user.role, method, device: deviceOf(ua) }]);
  } catch (e) {
    console.error("sign-in log failed", e);
  }
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
  await startSession(user, "password");
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
  await startSession(user, "emailed code");
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
  let email: string;
  try {
    email = String((await jwtVerify(token, key())).payload.email);
  } catch {
    return null;                       // not signed in (or the cookie is no good)
  }
  // Signed in. If the Users tab can't be read right now (Google busy), say so rather than "sign in again".
  let row;
  try {
    row = await userRow(email);
  } catch (e) {
    console.error("Users lookup failed", e);
    throw new SheetsBusyError();
  }
  const user = row ? toUser(row) : null;
  if (user && row) noteLastSeen(row);
  return user;
}

export class SheetsBusyError extends Error {
  constructor() { super("Google Sheets is busy right now. Wait a few seconds and try again."); }
}

/** Today's date in Central, e.g. "2026-10-01". */
export const todayCentral = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

let usersHeaderChecked = false;
/** Record that this person used the app today (one sheet write per person per day, after the page is sent). */
function noteLastSeen(row: Record<string, string> & { _row: number }) {
  const today = todayCentral();
  if ((row.last_seen || "").slice(0, 10) === today) return;
  row.last_seen = today;                    // so other checks during this request don't write again
  const write = async () => {
    try {
      if (!usersHeaderChecked) { await ensureHeader("Users"); usersHeaderChecked = true; }
      await updateCell("Users", row._row, "last_seen", today);
    } catch (e) {
      console.error("last seen update failed", e);
    }
  };
  try { after(write); } catch { void write(); }
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!u.hasPassword) redirect("/account/password");
  return u;
}

/** Staff only (not customers): for the Rules and Help pages. */
export async function requireStaff(): Promise<User> {
  const u = await requireUser();
  if (u.role === "customer") redirect("/projects");
  return u;
}

/** Can this person see this project? Customers only see the projects listed for them. */
export function canSee(u: User, projectKey: string): boolean {
  return u.role !== "customer" || u.projects.includes(projectKey);
}

/** Customers and viewers are read-only: no Sync, no rule changes. */
export const canEdit = (u: User) => u.role === "admin" || u.role === "tech";

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/projects");
  return u;
}
