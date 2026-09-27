"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncJob } from "@/lib/data";

const RANK = { queued: 0, running: 1, done: 2, failed: 2 } as const;
const POLL_MS = 4000;
const SHOW_DONE_MS = 15 * 60_000;     // keep "Synced" / "Failed" visible this long after it finished
const SLOW_PICKUP_MS = 2 * 60_000;    // the worker checks the queue every 30 seconds

const active = (j: SyncJob | null) => !!j && (j.status === "queued" || j.status === "running");
const ms = (iso: string) => (iso ? Date.parse(iso) : NaN);

function clock(msElapsed: number) {
  const s = Math.max(0, Math.floor(msElapsed / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ago(iso: string, now: number) {
  const m = Math.floor((now - ms(iso)) / 60_000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`;
}

/** Is `a` a newer view of the sync than `b`? */
function newer(a: SyncJob | null, b: SyncJob | null) {
  if (!a) return false;
  if (!b) return true;
  if (a.id !== b.id) return a.requestedAt > b.requestedAt;
  return RANK[a.status] > RANK[b.status] || (a.status === b.status && a.step !== b.step);
}

export default function RefreshButton({ project, job: initial, compact = false }:
  { project: string; job: SyncJob | null; compact?: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<SyncJob | null>(initial);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const wasActive = useRef(active(initial));

  // Adopt newer data when the page reloads.
  useEffect(() => { setJob((j) => (newer(initial, j) ? initial : j)); }, [initial]);

  // While a sync is waiting or running: poll its status, and tick the clock every second.
  const isActive = active(job);
  useEffect(() => {
    if (!isActive) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/refresh?project=${encodeURIComponent(project)}`, { cache: "no-store" });
        if (r.ok) setJob((await r.json()).job);
      } catch { /* try again next poll */ }
    }, POLL_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [isActive, project]);

  // When it finishes, reload the page so the new numbers show.
  useEffect(() => {
    if (wasActive.current && !isActive) router.refresh();
    wasActive.current = isActive;
  }, [isActive, router]);

  async function start() {
    setSending(true);
    setError("");
    try {
      const r = await fetch("/api/refresh", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) setError(data.error || "Could not start the sync");
      else if (data.job) setJob(data.job);
      setNow(Date.now());
    } catch {
      setError("Could not reach the website. Check your connection.");
    }
    setSending(false);
  }

  const button = (label = "Refresh") => (
    <button disabled={sending} onClick={start} title="Pull the latest data from BuildingStart">
      {sending ? "Sending…" : label}
    </button>
  );

  let body: React.ReactNode;
  if (job?.status === "queued") {
    const waited = now - ms(job.requestedAt);
    body = (
      <>
        <div><span className="pill gray">Waiting</span> <span className="num">{clock(waited)}</span></div>
        <div className="sync-step">
          {job.ahead > 0 ? `${job.ahead} sync${job.ahead > 1 ? "s" : ""} ahead of this one`
            : "Waiting for the mini PC to pick it up"}
        </div>
        {job.ahead === 0 && waited > SLOW_PICKUP_MS && (
          <div className="sync-step error">The mini PC hasn&apos;t started it. It normally starts within a minute,
            so it may be off, asleep or not running.</div>
        )}
      </>
    );
  } else if (job?.status === "running") {
    const took = now - ms(job.startedAt || job.requestedAt);
    const slow = job.lastMinutes ? took > job.lastMinutes * 2 * 60_000 + 5 * 60_000 : took > 30 * 60_000;
    body = (
      <>
        <div><span className="pill warn">Syncing</span> <span className="num">{clock(took)}</span></div>
        <div className="sync-step">{job.step || "Working…"}</div>
        {!compact && job.lastMinutes && <div className="sync-step muted">Last sync took about {job.lastMinutes} min</div>}
        {slow && <div className="sync-step error">This is taking longer than usual.</div>}
      </>
    );
  } else if (job?.status === "failed" && now - ms(job.finishedAt || job.requestedAt) < SHOW_DONE_MS) {
    body = (
      <>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span className="pill bad">Sync failed</span>{button("Try again")}</div>
        <div className="sync-step error">{job.step}</div>
      </>
    );
  } else if (job?.status === "done" && now - ms(job.finishedAt) < SHOW_DONE_MS) {
    body = (
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <span className="pill ok">✓ Synced {ago(job.finishedAt, now)}</span>{button()}
      </div>
    );
  } else {
    body = button();
  }

  return (
    <div className={compact ? "sync compact" : "sync"}>
      {body}
      {error && <div className="sync-step error">{error}</div>}
    </div>
  );
}
