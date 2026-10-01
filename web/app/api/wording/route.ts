import { NextResponse } from "next/server";
import { canEdit, canSee, currentUser } from "@/lib/auth";
import { loadResults } from "@/lib/results";
import { reviewWording } from "@/lib/wording";

export const maxDuration = 60;     // a big project's review can take ~30 seconds

/** Review wording: send the project's open deficiencies (new or changed wording only) to Claude. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { project, all } = (await req.json().catch(() => ({}))) as { project?: string; all?: boolean };
  if (!project) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  if (!canEdit(user) || !canSee(user, project)) return NextResponse.json({ error: "You have read-only access" }, { status: 403 });
  const results = await loadResults(project);
  if (!results) return NextResponse.json({ error: "Sync the project first." }, { status: 400 });
  try {
    const file = await reviewWording(project, results.deficiencies, !!all);
    return NextResponse.json({ ok: true, wording: file });
  } catch (e) {
    console.error("wording review failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
