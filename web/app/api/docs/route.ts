import { NextResponse } from "next/server";
import { canEdit, canSee, currentUser } from "@/lib/auth";
import { docsJob, getProject, requestDocs, setDocsFolder } from "@/lib/data";
import { askDocs, loadHistory, loadManifest, QUICK, type Mode } from "@/lib/docs";

export const maxDuration = 60;

async function gate(project: string | null) {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };
  if (!project) return { error: NextResponse.json({ error: "Missing project" }, { status: 400 }) };
  if (!canEdit(user) || !canSee(user, project)) return { error: NextResponse.json({ error: "You have read-only access" }, { status: 403 }) };
  const data = await getProject(project);
  if (!data) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  return { user, project: data.project };
}

/** Where the project's documents stand: folder, last update, what was read, questions already asked. */
export async function GET(req: Request) {
  const g = await gate(new URL(req.url).searchParams.get("project"));
  if ("error" in g) return g.error;
  const [job, manifest, history] = await Promise.all([docsJob(g.project.id), loadManifest(g.project.id), loadHistory(g.project.id)]);
  return NextResponse.json({
    folder: manifest?.folder.path || g.project.dropboxPath, updated: g.project.docsUpdated, status: g.project.docsStatus, job,
    found: manifest?.found ?? null, missing: manifest?.missing ?? [], otherTypes: manifest?.other_types ?? {},
    files: manifest?.files.length ?? 0, pages: manifest?.files.reduce((n, f) => n + f.pages, 0) ?? 0,
    skipped: (manifest?.skipped ?? []).map((s) => ({ name: s.name, category: s.category, reason: s.reason })),
    history: history.slice(0, 20),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as
    { project?: string; action?: string; question?: string; mode?: string; unit?: string; path?: string };
  const g = await gate(body.project ?? null);
  if ("error" in g) return g.error;
  const project = g.project.id;
  try {
    if (body.action === "update") {
      const r = await requestDocs(project, g.user);
      return NextResponse.json({ ok: true, result: r });
    }
    if (body.action === "folder") {
      const path = (body.path ?? "").trim();
      if (!path) return NextResponse.json({ error: "Paste the folder's path or Dropbox link." }, { status: 400 });
      await setDocsFolder(project, path);
      await requestDocs(project, g.user);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "ask") {
      const mode: Mode = (["tolerances", "tab", "design"] as const).find((m) => m === body.mode) ?? "ask";
      const unit = (body.unit ?? "").trim().slice(0, 80);
      const typed = (body.question ?? "").trim();
      // A unit in the unit box goes with a typed question too, unless the question already names it.
      const question = mode !== "ask" ? QUICK[mode](unit) : !typed ? "" :
        unit && !typed.toLowerCase().includes(unit.toLowerCase())
          ? `${typed}\n(This question is about ${unit} only; answer for that unit.)` : typed;
      if (!question) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
      if (question.length > 1500) return NextResponse.json({ error: "That question is too long." }, { status: 400 });
      return NextResponse.json({ ok: true, answer: await askDocs(project, question, mode, g.user.name || g.user.email) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("docs request failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
