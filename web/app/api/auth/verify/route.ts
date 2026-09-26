import { NextResponse } from "next/server";
import { finishSignIn } from "@/lib/auth";

export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const result = await finishSignIn(code ?? "");
  if (result === "ok") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result === "wrong" ? "That code isn't right. Try again." :
    "That code has expired. Request a new one." }, { status: 400 });
}
