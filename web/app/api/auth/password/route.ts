import { NextResponse } from "next/server";
import { signInWithPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  try {
    const r = await signInWithPassword(email, password);
    if (r === "ok") return NextResponse.json({ ok: true });
    if (r === "no-password") return NextResponse.json({ error: "no-password" }, { status: 400 });
    if (r === "locked") return NextResponse.json({ error: "Too many tries. Wait 5 minutes, or use \"Email me a code\"." }, { status: 429 });
    return NextResponse.json({ error: "Email or password is wrong." }, { status: 400 });
  } catch (e) {
    console.error("password sign-in failed", e);
    return NextResponse.json({ error: "Sign-in is unavailable right now. Try again in a minute." }, { status: 500 });
  }
}
