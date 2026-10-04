// The server posts a project's BuildingStart values here (gzipped JSON) after each sync, when they changed
// (see worker/hitlist/values.py). The reply counts what arrived; the server checks it against what it sent.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { saveValues } from "@/lib/bsvalues";

export const maxDuration = 60;

function authorized(req: Request) {
  const expected = process.env.WORKER_SECRET || "";
  const got = req.headers.get("x-worker-secret") || "";
  return expected.length >= 16 && got.length === expected.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function POST(req: Request, ctx: { params: Promise<{ number: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { number } = await ctx.params;
  try {
    const counts = await saveValues(number, Buffer.from(await req.arrayBuffer()));
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Saving BuildingStart values failed", number, msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
