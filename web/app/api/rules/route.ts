import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { saveProjectRuleChanges, saveRuleChanges, type RuleChange } from "@/lib/rules";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (user.role === "viewer" || user.role === "customer") return NextResponse.json({ error: "You have read-only access" }, { status: 403 });
  const { typeKey, changes, project } = (await req.json().catch(() => ({}))) as
    { typeKey?: string; changes?: RuleChange[]; project?: string };
  if (!typeKey || !Array.isArray(changes)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    if (project) {
      if (!(await getProject(project))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      return NextResponse.json({ ok: true, changed: await saveProjectRuleChanges(project, typeKey, changes, user) });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Only admins can change the default rules" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, changed: await saveRuleChanges(typeKey, changes, user) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
