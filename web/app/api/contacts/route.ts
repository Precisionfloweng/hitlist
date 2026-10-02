import { NextResponse } from "next/server";
import { canEdit, canSee, currentUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { addContact, removeContact, updateContact, type ContactInput } from "@/lib/contacts";

/** Add, change or remove one contact on a project's list. Techs and admins only. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { project, action, id, contact } = (await req.json().catch(() => ({}))) as
    { project?: string; action?: string; id?: string; contact?: ContactInput };
  if (!project) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  if (!canEdit(user) || !canSee(user, project)) return NextResponse.json({ error: "You have read-only access" }, { status: 403 });
  if (!(await getProject(project))) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    const contacts =
      action === "add" ? await addContact(project, contact ?? {}, user) :
      action === "update" && id ? await updateContact(project, id, contact ?? {}) :
      action === "remove" && id ? await removeContact(project, id) :
      null;
    if (!contacts) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true, contacts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
