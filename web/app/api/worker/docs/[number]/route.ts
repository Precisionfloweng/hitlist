// The server posts a project's document index here in gzipped parts (see worker/hitlist/documents.py).
// "manifest" comes last; then parts the manifest no longer lists are deleted.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { saveDocsPart } from "@/lib/docs";

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
  const part = new URL(req.url).searchParams.get("part") || "";
  if (!/^[A-Za-z0-9-]{1,80}$/.test(part)) return NextResponse.json({ error: "bad part name" }, { status: 400 });
  const body = Buffer.from(await req.arrayBuffer());
  try {
    await saveDocsPart(number, part, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Saving document index failed", number, part, msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
