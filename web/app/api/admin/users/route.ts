import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listProjects, listUsers, removeUser, saveUser } from "@/lib/data";
import { sendMail } from "@/lib/mail";

type Body = {
  action?: "save" | "delete";
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
      if (!original && body.welcome && body.user.role === "customer") {
        const site = new URL(req.url).origin;
        const names = (await listProjects()).filter((p) => body.user!.projects?.includes(p.id)).map((p) => `${p.number} ${p.name}`);
        await sendMail(body.user.email.trim(), "Your access to project status from Precision Flow Engineering",
          `<p>Hi ${escapeHtml(body.user.name.split(" ")[0])},</p>` +
          `<p>Precision Flow Engineering has given you read-only access to the status of ` +
          `${names.map((n) => `<b>${escapeHtml(n)}</b>`).join(", ")}.</p>` +
          `<p><a href="${site}/login">Sign in at ${site.replace(/^https?:\/\//, "")}</a> with this email address. ` +
          `The first time, click <b>Email me a code</b>, enter the 6-digit code we send, and create your password. After that you just sign in with your email and password.</p>` +
          `<p>This information is confidential and provided for your project only.</p>`);
      } else if (!original && body.welcome) {
        const site = new URL(req.url).origin;
        await sendMail(body.user.email.trim(), "You've been given access to PFE Hitlist",
          `<p>Hi ${escapeHtml(body.user.name.split(" ")[0])},</p>` +
          `<p>${escapeHtml(me.name)} has given you access to <b>PFE Hitlist</b>, where you can see each project's ` +
          `completion, what's still missing, and open deficiencies.</p>` +
          `<p><a href="${site}/login">Sign in at ${site.replace(/^https?:\/\//, "")}</a> with this email address. ` +
          `The first time, click <b>Email me a code</b>, enter the 6-digit code we send, and create your password. After that you just sign in with your email and password.</p>` +
          `<p><b>Put it on your iPad's Home Screen</b> so it opens like an app:</p>` +
          `<ol>` +
          `<li>Open <a href="${site}">${site.replace(/^https?:\/\//, "")}</a> in <b>Safari</b>.</li>` +
          `<li>Tap the <b>Share</b> button (the square with an arrow pointing up) at the top of the screen.</li>` +
          `<li>Scroll down and tap <b>Add to Home Screen</b>, then tap <b>Add</b>. It will be named <b>PFE</b>.</li>` +
          `<li>Open <b>PFE</b> from your Home Screen and sign in once. It stays signed in after that.</li>` +
          `</ol>`);
      }
    } else {
      throw new Error("Bad request");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
