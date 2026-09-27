import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { saveRuleChanges, type RuleChange } from "@/lib/rules";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "Viewers can't change rules" }, { status: 403 });
  const { typeKey, changes } = (await req.json().catch(() => ({}))) as { typeKey?: string; changes?: RuleChange[] };
  if (!typeKey || !Array.isArray(changes)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const n = await saveRuleChanges(typeKey, changes, user);
    return NextResponse.json({ ok: true, changed: n });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
