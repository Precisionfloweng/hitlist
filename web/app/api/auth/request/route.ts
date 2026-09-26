import { NextResponse } from "next/server";
import { startSignIn } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter your work email." }, { status: 400 });

  let code: string | null;
  try {
    code = await startSignIn(email);
  } catch (e) {
    console.error("sign-in: reading Users tab failed", e);
    return NextResponse.json({ error: `Couldn't check the user list (Google Sheet): ${short(e)}` }, { status: 500 });
  }
  if (code) {
    try {
      await sendMail(email.trim(), `Your Hitlist sign-in code: ${code}`,
        `<p>Your PFE Hitlist sign-in code is</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>` +
        `<p>It expires in 10 minutes. If you didn't try to sign in, ignore this email.</p>`);
    } catch (e) {
      console.error("sign-in: sending email failed", e);
      return NextResponse.json({ error: `Couldn't send the code email (Gmail): ${short(e)}` }, { status: 500 });
    }
  }
  // Same answer either way, so the form doesn't reveal who has access.
  return NextResponse.json({ ok: true });
}

function short(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Never echo anything that could contain a secret; keep it to the first line.
  return msg.split("\n")[0].replace(/-----BEGIN[\s\S]*/g, "").slice(0, 160);
}
