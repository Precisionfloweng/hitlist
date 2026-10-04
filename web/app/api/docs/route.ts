import { NextResponse } from "next/server";
import { canEdit, canSee, currentUser } from "@/lib/auth";
import { docsJob, getProject, requestDocs, setDocsFolder } from "@/lib/data";
import { loadTolerancesWithDefaults, saveTolerances } from "@/lib/tolerances";
import { checkValues, loadValues } from "@/lib/bsvalues";
import { loadResults } from "@/lib/results";
import { leftReport, toleranceReport } from "@/lib/reports";
import { loadHistory, loadManifest, MODE_FOLDERS, QUICK, removeAnswer, saveHistory, writeHistory, type Answer, type Mode } from "@/lib/docs";
import { designReport } from "@/lib/reports";
import { runAgent } from "@/lib/agent";

export const maxDuration = 300;     // the AI may make several lookups (Fluid compute allows 300 s)

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
  const [job, manifest, history, values, results] = await Promise.all([docsJob(g.project.id), loadManifest(g.project.id),
    loadHistory(g.project.id), loadValues(g.project.id), loadResults(g.project.id)]);
  const p = g.project;
  return NextResponse.json({
    buildingStart: checkValues(values, results, p.lastSync, p.valuesUpdated, p.valuesStatus),
    folder: manifest?.folder.path || g.project.dropboxPath, updated: g.project.docsUpdated, status: g.project.docsStatus, job,
    found: manifest?.found ?? null, missing: manifest?.missing ?? [], otherTypes: manifest?.other_types ?? {},
    files: manifest?.files.length ?? 0, pages: manifest?.files.reduce((n, f) => n + f.pages, 0) ?? 0,
    skipped: (manifest?.skipped ?? []).map((s) => ({ name: s.name, category: s.category, reason: s.reason })),
    history: history.slice(0, 20),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as
    { project?: string; action?: string; question?: string; mode?: string; unit?: string; path?: string; at?: string; replyTo?: string };
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
    if (body.action === "remove") {
      if (!body.at) return NextResponse.json({ error: "Missing answer" }, { status: 400 });
      return NextResponse.json({ ok: true, history: (await removeAnswer(project, body.at)).slice(0, 20) });
    }
    if (body.action === "report") {           // Out of tolerance / What's left to do: worked out in code, not saved
      const results = await loadResults(project);
      if (body.mode === "design") {             // the unit's design values as entered in BuildingStart (no AI)
        const unit = (body.unit ?? "").trim();
        if (!unit) return NextResponse.json({ error: "Put a unit in the unit box first." }, { status: 400 });
        const values = await loadValues(project);
        if (!values) return NextResponse.json({ error: "This project's BuildingStart data hasn't arrived yet. Press Sync, then try again." }, { status: 400 });
        const report = designReport(values, unit);
        if (!report) return NextResponse.json({ error: `No unit named ${unit} in the BuildingStart data. Check the tag (the unit box suggests names as you type).` }, { status: 404 });
        return NextResponse.json({ ok: true, report });
      }
      if (body.mode === "left") {
        if (!results) return NextResponse.json({ error: "Sync the project first." }, { status: 400 });
        return NextResponse.json({ ok: true, report: leftReport(results) });
      }
      const values = await loadValues(project);
      if (!values) return NextResponse.json({ error: "This project's BuildingStart data hasn't arrived yet. Press Sync, then try again." }, { status: 400 });
      const { tol } = await loadTolerancesWithDefaults(project);
      return NextResponse.json({ ok: true, report: toleranceReport(values, results, tol) });
    }
    if (body.action === "ask") {
      const mode: Mode = (["tolerances", "tab", "design", "dv_drawings", "dv_submittals", "dv_compare"] as const).find((m) => m === body.mode) ?? "ask";
      if (mode.startsWith("dv_") && !(body.unit ?? "").trim()) return NextResponse.json({ error: "Put a unit in the unit box first." }, { status: 400 });
      const unit = (body.unit ?? "").trim().slice(0, 80);
      const typed = (body.question ?? "").trim();
      // A unit in the unit box goes with a typed question too, unless the question already names it.
      const question = mode !== "ask" ? QUICK[mode](unit) : !typed ? "" :
        unit && !typed.toLowerCase().includes(unit.toLowerCase())
          ? `${typed}\n(This question is about ${unit} only; answer for that unit.)` : typed;
      if (!question) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
      if (question.length > 1500) return NextResponse.json({ error: "That question is too long." }, { status: 400 });
      // A reply continues a saved thread: the AI gets its earlier turns.
      const history = body.replyTo ? await loadHistory(project) : [];
      const parent = body.replyTo ? history.find((h) => h.at === body.replyTo) : undefined;
      if (body.replyTo && !parent) return NextResponse.json({ error: "That conversation was deleted." }, { status: 404 });
      const { tol } = await loadTolerancesWithDefaults(project);
      const user = g.user;
      // The answer streams back as lines of JSON: {"step": "..."} while it works, then {"answer": ...} or {"error": ...}.
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(ctrl) {
          const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          try {
            const thread = parent ? [parent, ...(parent.replies ?? [])] : [];
            const answer = await runAgent(project, question, user.name || user.email, tol, thread, (step) => send({ step }),
              MODE_FOLDERS[mode]);
            let entry: Answer = answer;
            if (parent) {
              const now = await loadHistory(project);                 // fresh copy: someone may have asked meanwhile
              const p = now.find((h) => h.at === parent.at) ?? parent;
              entry = { ...p, replies: [...(p.replies ?? []), answer] };
              await writeHistory(project, [entry, ...now.filter((h) => h.at !== parent.at)]);
            } else {
              await saveHistory(project, answer);
            }
            // Tolerances found in the spec go straight onto the project (Rules / Tol. tab, Overview, checklist, AI).
            let tolerancesSaved = false;
            if (answer.tolerances && Object.keys(answer.tolerances).length) {
              await saveTolerances(project, answer.tolerances, user);
              tolerancesSaved = true;
            }
            send({ ok: true, answer, entry, tolerancesSaved });
          } catch (e) {
            console.error("docs question failed", e);
            send({ error: (e as Error).message || "That didn't work. Try again." });
          }
          ctrl.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("docs request failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
