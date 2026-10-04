import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { saveDefaultTolerance } from "@/lib/settings";
import type { Tol } from "@/lib/toleranceCats";

/** Company settings: admins (and the owner) only. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { defaultTolerance?: Partial<Tol> };
  try {
    if (!body.defaultTolerance) throw new Error("Nothing to save");
    return NextResponse.json({ ok: true, defaultTolerance: await saveDefaultTolerance(body.defaultTolerance, user) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
