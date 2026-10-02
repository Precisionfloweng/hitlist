import { NextResponse } from "next/server";
import { canEdit, canSee, currentUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { saveTolerances } from "@/lib/tolerances";
import type { Tolerances } from "@/lib/toleranceCats";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { project, values } = (await req.json().catch(() => ({}))) as { project?: string; values?: Tolerances };
  if (!project || !values) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  if (!canEdit(user) || !canSee(user, project)) return NextResponse.json({ error: "You have read-only access" }, { status: 403 });
  if (!(await getProject(project))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, tolerances: await saveTolerances(project, values, user) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
