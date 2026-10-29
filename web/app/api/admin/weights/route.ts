import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { recalcCompletePcts, saveWeights } from "@/lib/settings";
import { loadResults } from "@/lib/results";
import { saveTypeWeights } from "@/lib/rules";

export const maxDuration = 120;     // saving recalculates every project from its last sync

async function admin() {
  const user = await currentUser();
  return user && user.role === "admin" ? user : null;
}

/** One project's results cut down to what the preview needs (field names and each unit's codes), so the page can
 *  work out the job % with the weights being edited. */
export async function GET(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const project = new URL(req.url).searchParams.get("project") ?? "";
  const r = project ? await loadResults(project) : null;
  return NextResponse.json({ types: r ? r.types.map((t) => ({ key: t.key, name: t.name,
    fields: t.fields.map((f) => ({ label: f.label, status: f.status })),
    units: t.units.map((u) => ({ codes: u.codes, required: u.required, required_filled: u.required_filled })),
    summary: { fields_pct: t.summary.fields_pct } })) : [], fields_pct: r?.summary.fields_pct ?? 100 });
}

/** Save the category shares (`weights`, optional) and any types' item weights (`types`: typeKey → changed fields),
 *  then recalculate every project once. */
export async function POST(req: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { weights?: Record<string, unknown>;
    types?: Record<string, { order: number; weight: number | string | null; group: string }[]> };
  try {
    let weights;
    if (body.weights) weights = (await saveWeights(body.weights, user, false)).weights;
    let changed = 0;
    for (const [typeKey, fields] of Object.entries(body.types ?? {})) {
      if (Array.isArray(fields) && fields.length) changed += await saveTypeWeights(typeKey, fields, user);
    }
    const updated = body.weights || changed ? await recalcCompletePcts(weights) : 0;
    return NextResponse.json({ ok: true, weights, changed, updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
