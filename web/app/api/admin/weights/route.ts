import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { saveWeights } from "@/lib/settings";
import { loadResults } from "@/lib/results";
import { typeTotals } from "@/lib/completion";

export const maxDuration = 120;     // saving recalculates every project from its last sync

async function admin() {
  const user = await currentUser();
  return user && user.role === "admin" ? user : null;
}

/** One project's per-type totals, for the preview. */
export async function GET(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const project = new URL(req.url).searchParams.get("project") ?? "";
  const r = project ? await loadResults(project) : null;
  return NextResponse.json({ totals: r ? typeTotals(r.types) : [] });
}

export async function POST(req: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { weights?: Record<string, unknown> };
  try {
    return NextResponse.json({ ok: true, ...(await saveWeights(body.weights ?? {}, user)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
