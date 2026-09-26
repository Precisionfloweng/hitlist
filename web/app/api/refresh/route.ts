import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { requestRefresh } from "@/lib/data";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { project } = (await req.json().catch(() => ({}))) as { project?: string };
  if (!project) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  const r = await requestRefresh(project, user);
  if (r === "missing") return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ status: r });
}
