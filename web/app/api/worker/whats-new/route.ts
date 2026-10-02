// The server (worker) reads the "What's new" list here for the Monday email.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ALL } from "@/lib/whatsNew";

function authorized(req: Request) {
  const expected = process.env.WORKER_SECRET || "";
  const got = req.headers.get("x-worker-secret") || "";
  return expected.length >= 16 && got.length === expected.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ entries: ALL });
}
