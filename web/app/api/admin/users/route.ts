import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listProjects, listUsers, removeUser, saveUser } from "@/lib/data";
import { emailButton, sendMail } from "@/lib/mail";

type Body = {
  action?: "save" | "delete" | "welcome";
  user?: { email: string; name: string; role: string; active: boolean; projects?: string[] };
  original?: string;
  welcome?: boolean;
};

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Body;
  try {
    const original = body.original?.trim().toLowerCase();
    const isSelf = original === me.email;
    const target = original ? (await listUsers()).find((u) => u.email === original) : undefined;
    if (target?.role === "owner") {
      if (body.action === "delete") throw new Error(`${target.name} is an owner and can't be removed`);
      if (body.user && (body.user.role !== "owner" || !body.user.active)) {
        throw new Error(`${target.name} is an owner: their role and access can't be changed`);
      }
    }
    if (body.action === "delete" && original) {
      if (isSelf) throw new Error("You can't remove yourself");
      await removeUser(original);
    } else if (body.action === "save" && body.user) {
      if (isSelf && !["admin", "owner"].includes(body.user.role) || isSelf && !body.user.active) {
        throw new Error("You can't remove your own admin access or turn yourself off");
      }
      await saveUser(body.user, original);
      const admins = (await listUsers()).filter((u) => ["admin", "owner"].includes(u.role) && u.active);
      if (admins.length === 0) throw new Error("There must be at least one active admin");
      if (!original && body.welcome) await sendWelcome(body.user, me.name, new URL(req.url).origin);
    } else if (body.action === "welcome" && original) {
      // (Re)send the welcome email to someone already on the list, e.g. added before emails were set up.
      if (!target) throw new Error("That person isn't on the list");
      if (!target.active) throw new Error(`${target.name}'s access is turned off. Turn it on first.`);
      await sendWelcome(target, me.name, new URL(req.url).origin);
    } else {
      throw new Error("Bad request");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** The welcome email: sign-in steps, plus iPad steps for staff or the project list for a customer. */
async function sendWelcome(user: { email: string; name: string; role: string; projects?: string[] }, by: string, site: string) {
  if (user.role === "customer") {
    const names = (await listProjects()).filter((p) => user.projects?.includes(p.id)).map((p) => `${p.number} ${p.name}`);
    await sendMail(user.email.trim(), "Your access to project status from Precision Flow Engineering",
      `<p style="margin:0 0 12px">Hi ${escapeHtml(user.name.split(" ")[0])},</p>` +
      `<p style="margin:0 0 12px">Precision Flow Engineering has given you read-only access to the status of ` +
      `${names.map((n) => `<b>${escapeHtml(n)}</b>`).join(", ")}.</p>` +
      `<div style="margin:0 0 16px">${emailButton(`${site}/login`, "Sign in")}</div>` +
      firstTime(site) +
      `<p style="margin:16px 0 0">This information is confidential and provided for your project only.</p>`);
    return;
  }
  await sendMail(user.email.trim(), "You've been given access to PFE Hitlist",
    `<p style="margin:0 0 12px">Hi ${escapeHtml(user.name.split(" ")[0])},</p>` +
    `<p style="margin:0 0 12px">${escapeHtml(by)} has given you access to <b>PFE Hitlist</b>, where you can see each ` +
    `project's completion, what's still missing, and open deficiencies.</p>` +
    `<div style="margin:0 0 16px">${emailButton(`${site}/login`, "Sign in to Hitlist")}</div>` +
    firstTime(site) +
    `<p style="margin:18px 0 6px"><b>Put it on your iPad's Home Screen</b> so it opens like an app:</p>` +
    `<ol style="margin:0;padding-left:22px">` +
    `<li>Open <b>${site.replace(/^https?:\/\//, "")}</b> in <b>Safari</b>.</li>` +
    `<li>Tap <b>Share</b> (the square with an arrow pointing up).</li>` +
    `<li>Tap <b>Add to Home Screen</b>, then <b>Add</b>. It&#39;s named <b>PFE</b>.</li>` +
    `<li>Open <b>PFE</b> from the Home Screen and sign in once. It stays signed in.</li>` +
    `</ol>`);
}

/** "First time signing in" steps, shared by the welcome emails. */
function firstTime(site: string) {
  return `<p style="margin:0 0 6px"><b>First time signing in</b> (at ${site.replace(/^https?:\/\//, "")}):</p>` +
    `<ol style="margin:0;padding-left:22px">` +
    `<li>Enter this email address and click <b>Email me a code</b>.</li>` +
    `<li>Enter the 6-digit code we send you and create your password.</li>` +
    `<li>After that, sign in with your email and password.</li>` +
    `</ol>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
