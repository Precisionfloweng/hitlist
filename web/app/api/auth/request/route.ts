import { NextResponse } from "next/server";
import { startSignIn } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter your work email." }, { status: 400 });
  const code = await startSignIn(email);
  if (code) {
    await sendMail(email.trim(), `Your Hitlist sign-in code: ${code}`,
      `<p>Your PFE Hitlist sign-in code is</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>` +
      `<p>It expires in 10 minutes. If you didn't try to sign in, ignore this email.</p>`);
  }
  // Same answer either way, so the form doesn't reveal who has access.
  return NextResponse.json({ ok: true });
}
