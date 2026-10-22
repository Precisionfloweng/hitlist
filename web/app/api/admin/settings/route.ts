import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { saveCompanyTolerances } from "@/lib/settings";
import type { Tol } from "@/lib/toleranceCats";

/** Company settings: admins (and the owner) only. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { all?: Partial<Tol>; cats?: Record<string, Partial<Tol>> };
  try {
    if (!body.all) throw new Error("Nothing to save");
    return NextResponse.json({ ok: true, defaults: await saveCompanyTolerances(body.all, body.cats ?? {}, user) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
