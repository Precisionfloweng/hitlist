import { NextResponse } from "next/server";
import { canEdit, canSee, currentUser } from "@/lib/auth";
import { loadResults } from "@/lib/results";
import { loadTolerancesWithDefaults } from "@/lib/tolerances";
import { refineText } from "@/lib/wording";

export const maxDuration = 30;

const norm = (p: string) => p.split("/").map((x) => x.trim()).filter(Boolean).join("/");

/** AI Tools "Refine": clean up one deficiency or note for a project, with the chosen unit's context. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { project, kind, text, unitPath } = (await req.json().catch(() => ({}))) as
    { project?: string; kind?: string; text?: string; unitPath?: string };
  if (!project || !text?.trim()) return NextResponse.json({ error: "Type or paste something first." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "That's too long. Keep it to one deficiency or note." }, { status: 400 });
  if (!canEdit(user) || !canSee(user, project)) return NextResponse.json({ error: "You have read-only access" }, { status: 403 });
  const [results, tol] = await Promise.all([loadResults(project), loadTolerancesWithDefaults(project).then((t) => t.tol)]);

  let unit = null;
  const existing: string[] = [];
  if (unitPath && results) {
    const want = norm(unitPath);
    for (const t of results.types) {
      const u = t.units.find((x) => norm(x.path) === want);
      if (u) {
        unit = { key: "1", label: "", equipment: u.name, itemType: t.export_sheet || t.name, path: u.path, text: "" };
        break;
      }
    }
    for (const d of results.deficiencies) if (d.open && norm(d.path) === want) existing.push(`#${d.number}: ${d.text}`);
    for (const n of results.notes ?? []) if (norm(n.path) === want) existing.push(`Note: ${n.text}`);
  }
  try {
    const out = await refineText(kind === "notes" ? "notes" : "deficiencies", text.trim(), unit, existing, tol);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error("AI tools refine failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
