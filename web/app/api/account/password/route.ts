import { NextResponse } from "next/server";
import { currentUser, setPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const problem = await setPassword(user, password ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  return NextResponse.json({ ok: true });
}
