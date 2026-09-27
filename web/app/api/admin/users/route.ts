import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listUsers, removeUser, saveUser } from "@/lib/data";
import { sendMail } from "@/lib/mail";

type Body = {
  action?: "save" | "delete";
  user?: { email: string; name: string; role: string; active: boolean };
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
    if (body.action === "delete" && original) {
      if (isSelf) throw new Error("You can't remove yourself");
      await removeUser(original);
    } else if (body.action === "save" && body.user) {
      if (isSelf && (body.user.role !== "admin" || !body.user.active)) {
        throw new Error("You can't remove your own admin access or turn yourself off");
      }
      await saveUser(body.user, original);
      const admins = (await listUsers()).filter((u) => u.role === "admin" && u.active);
      if (admins.length === 0) throw new Error("There must be at least one active admin");
      if (!original && body.welcome) {
        const site = new URL(req.url).origin;
        await sendMail(body.user.email.trim(), "You've been given access to PFE Hitlist",
          `<p>Hi ${escapeHtml(body.user.name.split(" ")[0])},</p>` +
          `<p>${escapeHtml(me.name)} has given you access to <b>PFE Hitlist</b>, where you can see each project's ` +
          `test &amp; balance completion, what's still missing, and open deficiencies.</p>` +
          `<p><a href="${site}/login">Sign in at ${site.replace(/^https?:\/\//, "")}</a> with this email address. ` +
          `The first time, click <b>Email me a code</b>, enter the 6-digit code we send, and create your password. After that you just sign in with your email and password.</p>`);
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
