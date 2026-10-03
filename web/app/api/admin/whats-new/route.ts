import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { whatsNew, whatsNewEmailHtml } from "@/lib/whatsNew";

/** Email the signed-in admin a preview of the "New in Hitlist" part of the Monday email. */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const site = new URL(req.url).origin;
  const tech = whatsNewEmailHtml(whatsNew(false), site, false);
  const admin = whatsNewEmailHtml(whatsNew(true), site, true);
  try {
    await sendMail(me.email, "Preview: New in Hitlist (Monday email)",
      `<p style="margin:0 0 10px"><b>What techs will see:</b></p>${tech || "<p>(no changes yet)</p>"}` +
      `<p style="margin:18px 0 10px"><b>What admins will see:</b></p>${admin || "<p>(no changes yet)</p>"}`);
    return NextResponse.json({ ok: true, to: me.email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
