import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { removeProject, saveProject, type ProjectInput } from "@/lib/data";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as
    { action?: "save" | "delete"; project?: ProjectInput; original?: string };
  try {
    if (body.action === "delete" && body.original) {
      await removeProject(body.original);
    } else if (body.action === "save" && body.project) {
      const p = body.project;
      if (!p.number?.trim() || !p.name?.trim()) throw new Error("Project # and name are required");
      await saveProject({ ...p, number: p.number.trim(), name: p.name.trim() }, body.original);
    } else {
      throw new Error("Bad request");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
