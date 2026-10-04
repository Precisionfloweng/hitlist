"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtTol, normalizeTolerances, TOLERANCE_CATS } from "@/lib/toleranceCats";

type Source = { id: string; category: string; path: string; name: string; page: number; modified: string };
type Answer = { question: string; answer: string; found: boolean; sources: Source[];
  tolerances: Record<string, unknown> | null; at: string; by: string };
type Job = { status: "queued" | "running" | "done" | "failed"; step: string; ahead: number } | null;
type BsCheck = { units: number; values: number; types: number; synced: string; missing: number; ok: boolean; problem: string };
type Info = { buildingStart?: BsCheck; folder: string; updated: string; status: string; job: Job; found: Record<string, number> | null;
  missing?: string[]; otherTypes?: Record<string, string[]>;
  files: number; pages: number; skipped: { name: string; category: string; reason: string }[]; history: Answer[] };

const FOLDERS = ["Drawings and Specs", "Submittal", "TAB Plan", "ASIs and RFIs", "Change Orders"];

const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit" });
};
const fileDate = (s: string) => {
  const d = new Date(`${s}T12:00:00`);
  return isNaN(+d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const showPath = (p: string) => p.split("/").filter(Boolean).join(" / ");

function AnswerView({ a, project, onClose, saved = false }: { a: Answer; project: string; onClose?: () => void; saved?: boolean }) {
  const router = useRouter();
  const [tolMsg, setTolMsg] = useState(saved ? "Saved to the Rules / Tol. tab ✓" : "");
  const tol = normalizeTolerances(a.tolerances);   // also reads answers saved before tolerances had + and −
  const tolText = TOLERANCE_CATS.filter((c) => tol[c.key]).map((c) => `${c.full} ${fmtTol(tol[c.key])}`).join(" · ");
  async function fillTolerances() {
    setTolMsg("Saving…");
    const r = await fetch("/api/tolerances", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, values: tol }) });
    const data = await r.json().catch(() => ({}));
    setTolMsg(r.ok ? "Saved to the Rules / Tol. tab ✓" : data.error || "Couldn't save");
    if (r.ok) router.refresh();
  }
  return (
    <div className="docs-answer">
      {onClose && <button type="button" className="ai-close" onClick={onClose} title="Delete this answer" aria-label="Delete answer">✕</button>}
      <div className={`docs-answer-text${a.found ? "" : " notfound"}`}>{a.answer}</div>
      {tolText && (
        <div className="docs-tol">
          <span>Tolerances found: {tolText}</span>
          {tolMsg ? <span className={tolMsg.includes("✓") ? "pill ok" : "muted"}>{tolMsg}</span>
            : <button className="primary" onClick={fillTolerances}>Use these tolerances</button>}
        </div>
      )}
      {a.sources.length > 0 && (
        <ul className="docs-sources">
          {a.sources.map((s) => (
            s.category === "BuildingStart"
              ? <li key={s.id}><b>{s.id}</b> {s.name} <span className="muted">· BuildingStart data{s.modified && `, synced ${fileDate(s.modified)}`}</span></li>
              : <li key={s.id}><b>{s.id}</b> {s.category} / {s.path} <span className="muted">· page {s.page}{s.modified && ` · ${fileDate(s.modified)}`}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ask questions about the project's Dropbox documents; answers cite the file and page. */
export default function DocsAsk({ project, units }: { project: string; units: string[] }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [question, setQuestion] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [answerSaved, setAnswerSaved] = useState(false);       // its tolerances were saved automatically
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [path, setPath] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/docs?project=${encodeURIComponent(project)}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) setLoadErr(data.error || "Couldn't load the documents status");
      else { setInfo(data); setLoadErr(""); }
    } catch {
      setLoadErr("Could not reach the website. Check your connection.");
    }
  }, [project]);

  useEffect(() => { load(); }, [load]);
  const working = info?.job && (info.job.status === "queued" || info.job.status === "running");
  useEffect(() => {                           // follow an update while the server works on it
    if (!working) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [working, load]);

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label); setError("");
    try {
      const r = await fetch("/api/docs", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, ...body }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || "That didn't work. Try again."); return null; }
      return data;
    } catch {
      setError("Could not reach the website. Check your connection.");
      return null;
    } finally {
      setBusy("");
    }
  }

  /** Delete an answer for good: off the screen and out of Asked before. */
  async function removeAnswer(at: string) {
    if (answer?.at === at) setAnswer(null);
    setInfo((i) => (i ? { ...i, history: i.history.filter((h) => h.at !== at) } : i));
    const data = await post({ action: "remove", at }, "remove");
    if (data?.history) setInfo((i) => (i ? { ...i, history: data.history } : i));
  }

  async function ask(mode: string) {
    setAnswer(null);
    const data = await post({ action: "ask", mode, question, unit }, mode);
    if (data?.answer) { setAnswer(data.answer); setAnswerSaved(!!data.tolerancesSaved); load(); if (data.tolerancesSaved) router.refresh(); }
  }

  const ready = !!info && info.files > 0;
  const bs = info?.buildingStart;
  const canAsk = ready || (!!bs && bs.units > 0);           // typed questions also work from the BuildingStart data alone
  // The answer on show: the one just asked, or (coming back to the page) the latest saved one.
  const shown = answer ?? info?.history[0] ?? null;
  const older = (info?.history ?? []).filter((h) => h.at !== shown?.at);
  // A finished update that left no folder and no status means the server ran it as a normal sync (old server code).
  const staleServer = !!info && !info.folder && !info.status && info.job?.status === "done";
  const failed = info?.status.startsWith("failed:") ? info.status.slice(7).trim() : "";
  const jobFailed = info?.job?.status === "failed" ? info.job.step : "";

  return (
    <div className="card ai-card docs-card">
      <div className="ai-head">
        <span className="ai-spark" aria-hidden>✨</span>
        <div>
          <b>Search the Documents</b>
          <div className="muted" style={{ fontSize: 13 }}>
            Answers come from this project&apos;s Dropbox folder (specs, submittals, drawings, TAB plan, ASIs/RFIs,
            change orders) and its BuildingStart data from the last sync, with the source for each value.
          </div>
        </div>
      </div>

      {loadErr && <div className="error">{loadErr}</div>}
      {info && (
        <div className="docs-status">
          <div className="docs-folder">
            📁 {info.folder ? <span>{showPath(info.folder)}</span>
              : working ? <span className="muted">Looking for the project&apos;s Dropbox folder…</span>
              : staleServer ? <span className="error">The update finished but no folder was linked: the server needs the latest update (git pull, pip install, restart the worker).</span>
              : <span className="muted">No Dropbox folder linked yet. Find documents looks for it by job number and name.</span>}
          </div>
          {working ? (
            <div className="docs-working">⏳ {info.job!.status === "queued"
              ? `Waiting for the server${info.job!.ahead ? ` (${info.job!.ahead} ahead)` : ""}…`
              : info.job!.step || "Reading documents…"}</div>
          ) : (
            <>
              {(failed || jobFailed) && <div className="error">{jobFailed || failed}</div>}
              {info.found && (
                <div className="docs-counts">
                  {FOLDERS.map((f) => (
                    <span key={f} className={info.found![f] ? "" : "zero"}
                      title={info.missing?.includes(f) ? "There's no folder with this name in the project folder" : undefined}>
                      {f} {info.missing?.includes(f) ? <i>no folder</i> : <b>{info.found![f] ?? 0}</b>}
                    </span>
                  ))}
                </div>
              )}
              {info.otherTypes && Object.keys(info.otherTypes).length > 0 && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Not read (file types Hitlist can&apos;t read yet): {Object.entries(info.otherTypes)
                    .map(([f, types]) => `${f}: ${types.join(", ")}`).join(" · ")}
                </div>
              )}
              {info.updated && <div className="muted" style={{ fontSize: 13 }}>
                {info.files} file{info.files === 1 ? "" : "s"}, {info.pages.toLocaleString()} pages · updated {when(info.updated)}
                {" "}· Syncing the project also checks for new files.
              </div>}
              {info.skipped.length > 0 && (
                <details className="docs-skipped">
                  <summary>{info.skipped.length} file{info.skipped.length === 1 ? "" : "s"} couldn&apos;t be read</summary>
                  <ul>{info.skipped.map((s, i) => <li key={i}>{s.category} / {s.name}: <span className="muted">{s.reason}</span></li>)}</ul>
                </details>
              )}
            </>
          )}
          {bs && (
            <div className={`docs-bs${bs.ok ? "" : " problem"}`}>
              <b>BuildingStart data:</b>{" "}
              {bs.units > 0 && <>{bs.units.toLocaleString()} units in {bs.types} type{bs.types === 1 ? "" : "s"}, {bs.values.toLocaleString()} values
                {bs.synced && <> · synced {fileDate(bs.synced.slice(0, 10))}</>}{bs.ok && " ✓"}</>}
              {bs.problem && <span>{bs.units > 0 ? " · " : ""}{bs.problem}</span>}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button disabled={!!busy || !!working} onClick={async () => { if (await post({ action: "update" }, "update")) load(); }}>
              {busy === "update" ? "Asking the server…" : ready ? "🔄 Update documents" : "🔍 Find documents"}
            </button>
            <button disabled={!!busy || !!working} onClick={() => { setChanging(!changing); setPath(""); }}>
              Set folder
            </button>
          </div>
          {changing && (
            <div className="docs-change">
              <input value={path} onChange={(e) => setPath(e.target.value)}
                placeholder="Paste the project folder's path (File Explorer) or its dropbox.com link" />
              <button className="primary" disabled={!path.trim() || !!busy}
                onClick={async () => { if (await post({ action: "folder", path }, "folder")) { setChanging(false); load(); } }}>
                {busy === "folder" ? "Saving…" : "Use this folder"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="docs-ask">
        <div className="docs-quick">
          <button disabled={!ready || !!busy} onClick={() => ask("tolerances")}>{busy === "tolerances" ? "Reading…" : "Tolerances"}</button>
          <button disabled={!ready || !!busy} onClick={() => ask("tab")}>{busy === "tab" ? "Reading…" : "TAB requirements"}</button>
          <span className="docs-design">
            <input list="docs-units" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (optional, used by Ask and Design values)" />
            <datalist id="docs-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
            <button disabled={!canAsk || !!busy || !unit.trim()} onClick={() => ask("design")}>{busy === "design" ? "Reading…" : "Design values"}</button>
          </span>
        </div>
        <textarea className="ai-input" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything, e.g. Does the design CFM entered for AHU-16 match the submittal? How many VAVs are left on floor 3? Which pumps still need amps?" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary ai-btn" disabled={!canAsk || !!busy || !question.trim()} onClick={() => ask("ask")}>
            {busy === "ask" ? "Reading…" : "Ask"}
          </button>
          {!canAsk && info && !working && <span className="muted" style={{ fontSize: 13 }}>Press Find documents to read this project&apos;s files first.</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </div>

      {shown && (
        <>
          <div className="docs-latest muted">
            {answer ? "Answer" : "Latest answer"} · {shown.by}, {when(shown.at)}
            {!answer && <> · <b>{shown.question.split("\n")[0]}</b></>}
          </div>
          <AnswerView key={shown.at} a={shown} project={project} saved={!!answer && answerSaved} onClose={() => removeAnswer(shown.at)} />
        </>
      )}

      {older.length > 0 && (
        <details className="docs-history">
          <summary>Asked before ({older.length})</summary>
          {older.map((h) => (
            <details key={h.at} className="docs-hist-item">
              <summary>{h.question.split("\n")[0]} <span className="muted">· {h.by}, {when(h.at)}</span></summary>
              <AnswerView a={h} project={project} onClose={() => removeAnswer(h.at)} />
            </details>
          ))}
        </details>
      )}
    </div>
  );
}
