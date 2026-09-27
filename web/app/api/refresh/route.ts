import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { requestRefresh, syncStatus } from "@/lib/data";

/** Live status of a project's latest sync (the Refresh button polls this). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const project = new URL(req.url).searchParams.get("project");
  if (!project) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  return NextResponse.json({ job: await syncStatus(project) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { project } = (await req.json().catch(() => ({}))) as { project?: string };
  if (!project) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  const r = await requestRefresh(project, user);
  if (r === "missing") return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ status: r, job: await syncStatus(project) });
}
