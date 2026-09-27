"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncJob } from "@/lib/data";

const RANK = { queued: 0, running: 1, done: 2, failed: 2 } as const;
const POLL_MS = 4000;
const SLOW_PICKUP_MS = 2 * 60_000;    // the worker checks the queue every 30 seconds

const active = (j: SyncJob | null) => !!j && (j.status === "queued" || j.status === "running");
const ms = (iso: string) => (iso ? Date.parse(iso) : NaN);

function clock(msElapsed: number) {
  const s = Math.max(0, Math.floor(msElapsed / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}


/** Is `a` a newer view of the sync than `b`? */
function newer(a: SyncJob | null, b: SyncJob | null) {
  if (!a) return false;
  if (!b) return true;
  if (a.id !== b.id) return a.requestedAt > b.requestedAt;
  return RANK[a.status] > RANK[b.status] || (a.status === b.status && a.step !== b.step);
}

/**
 * Live sync status plus the Refresh button.
 * `cells` renders two table cells (Sync Status, then the button) for the projects list.
 */
export default function RefreshButton({ project, job: initial, cells = false }:
  { project: string; job: SyncJob | null; cells?: boolean }) {
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

  const button = (
    <button className="primary" disabled={sending || isActive} onClick={start} title="Pull the latest data from BuildingStart">
      {sending ? "Sending…" : job?.status === "failed" ? "Try again" : "Refresh"}
    </button>
  );

  let status: React.ReactNode = <span className="muted">–</span>;
  if (job?.status === "queued") {
    const waited = now - ms(job.requestedAt);
    status = (
      <>
        <div className="sync-head"><span className="pill gray">Waiting</span> <span className="num">{clock(waited)}</span></div>
        <div className="sync-step">
          {job.ahead > 0 ? `${job.ahead} sync${job.ahead > 1 ? "s" : ""} ahead` : "Waiting on the server"}
        </div>
        {job.ahead === 0 && waited > SLOW_PICKUP_MS && (
          <div className="sync-note error">The server has not started.</div>
        )}
      </>
    );
  } else if (job?.status === "running") {
    const took = now - ms(job.startedAt || job.requestedAt);
    const slow = job.lastMinutes ? took > job.lastMinutes * 2 * 60_000 + 5 * 60_000 : took > 30 * 60_000;
    status = (
      <>
        <div className="sync-head"><span className="pill warn">Syncing</span> <span className="num">{clock(took)}</span></div>
        <div className="sync-step" title={job.step}>{job.step || "Working…"}</div>
        {!cells && job.lastMinutes && <div className="sync-note muted">Last sync took about {job.lastMinutes} min</div>}
        {slow && <div className="sync-note error">Taking longer than usual.</div>}
      </>
    );
  } else if (job?.status === "failed") {
    status = (
      <>
        <div className="sync-head"><span className="pill bad">Failed</span></div>
        <div className="sync-note error">{job.step}</div>
      </>
    );
  } else if (job?.status === "done") {
    status = <div className="sync-head"><span className="pill ok">✓ Complete</span></div>;
  }
  const errorLine = error && <div className="sync-note error">{error}</div>;

  if (cells) {
    return (
      <>
        <td className="ctr"><div className="sync centered">{status}{errorLine}</div></td>
        <td className="refresh-cell">{button}</td>
      </>
    );
  }
  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
      {job && <div className="sync inline">{status}{errorLine}</div>}
      {!job && errorLine}
      {button}
    </div>
  );
}
