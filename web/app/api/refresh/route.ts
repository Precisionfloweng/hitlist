import { NextResponse } from "next/server";
import { canEdit, canSee, currentUser as lookupUser, SheetsBusyError } from "@/lib/auth";

/** The signed-in person, or a "busy" reply when Google Sheets can't be read just now (not "sign in again"). */
async function currentUser() {
  try { return await lookupUser(); } catch (e) { if (e instanceof SheetsBusyError) return "busy" as const; throw e; }
}
const busy = () => NextResponse.json({ error: "Google Sheets is busy right now. Wait a few seconds and press Sync again." }, { status: 503 });
import { requestRefresh, syncStatus } from "@/lib/data";

/** Live status of a project's latest sync (the Refresh button polls this). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (user === "busy") return busy();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const project = new URL(req.url).searchParams.get("project");
  if (!project) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  if (!canSee(user, project)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ job: await syncStatus(project) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (user === "busy") return busy();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { project } = (await req.json().catch(() => ({}))) as { project?: string };
  if (!project) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  if (!canEdit(user) || !canSee(user, project)) return NextResponse.json({ error: "You have read-only access" }, { status: 403 });
  let r;
  try { r = await requestRefresh(project, user); } catch (e) { console.error("sync request failed", e); return busy(); }
  if (r === "missing") return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ status: r, job: await syncStatus(project) });
}
