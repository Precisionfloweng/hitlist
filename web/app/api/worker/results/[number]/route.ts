// The server (worker) posts each project's results file here after a sync.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { saveResults } from "@/lib/results";

function authorized(req: Request) {
  const expected = process.env.WORKER_SECRET || "";
  const got = req.headers.get("x-worker-secret") || "";
  return expected.length >= 16 && got.length === expected.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function POST(req: Request, ctx: { params: Promise<{ number: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { number } = await ctx.params;
  const body = await req.text();
  try {
    JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400 });
  }
  try {
    await saveResults(number, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Saving results failed", number, msg);
    return NextResponse.json({ error: `Could not save to Vercel Blob storage: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
