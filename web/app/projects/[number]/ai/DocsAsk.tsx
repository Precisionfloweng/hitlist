"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtTol, normalizeTolerances, specNote, TOLERANCE_CATS, TOLERANCE_GROUPS } from "@/lib/toleranceCats";
import type { DesignReport, LeftReport, ToleranceReport } from "@/lib/reports";
import ReportView from "./ReportView";

type Source = { id: string; category: string; path: string; name: string; page: number; modified: string };
type Answer = { question: string; answer: string; found: boolean; sources: Source[]; replies?: Answer[];
  table?: { columns: string[]; rows: string[][] };
  tolerances: Record<string, unknown> | null; at: string; by: string };
type Job = { status: "queued" | "running" | "done" | "failed"; step: string; ahead: number } | null;
type BsCheck = { units: number; values: number; types: number; synced: string; missing: number; ok: boolean; problem: string };
type Info = { buildingStart?: BsCheck; folder: string; updated: string; status: string; job: Job; found: Record<string, number> | null;
  missing?: string[]; otherTypes?: Record<string, string[]>;
  files: number; pages: number; skipped: { name: string; category: string; reason: string }[]; history: Answer[] };

const FOLDERS = ["Drawings and Specs", "Submittal", "ASIs and RFIs", "Change Orders", "Deficiency Reports"];

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

function AnswerTable({ t }: { t?: { columns: string[]; rows: string[][] } }) {
  if (!t || !t.rows.length) return null;
  return (
    <div className="docs-table-wrap">
      <table className="docs-table">
        <thead><tr>{t.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>{t.rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={/mismatch|≠|differs/i.test(c) ? "bad" : /not found/i.test(c) ? "muted" : ""}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Sources({ list }: { list: Source[] }) {
  if (!list.length) return null;
  return (
    <ul className="docs-sources">
      {list.map((s) => (
        s.category === "BuildingStart"
          ? <li key={s.id}><b>{s.id}</b> {s.name} <span className="muted">· BuildingStart data{s.modified && `, synced ${fileDate(s.modified)}`}</span></li>
          : <li key={s.id}><b>{s.id}</b> {s.category} / {s.path} <span className="muted">· page {s.page}{s.modified && ` · ${fileDate(s.modified)}`}</span></li>
      ))}
    </ul>
  );
}

/** A question's answer plus its replies, with a box to reply (the AI keeps the conversation in mind). */
export function AnswerView({ a, project, onClose, saved = false, onReply, busy, projectTol }: { a: Answer; project: string; onClose?: () => void;
  projectTol?: Record<string, { plus: string; minus: string }>;
  saved?: boolean; onReply?: (text: string) => Promise<boolean>; busy?: string }) {
  const [reply, setReply] = useState("");
  const router = useRouter();
  const tolFound = normalizeTolerances(a.tolerances);
  // Already on the project (saved automatically when asked, or by hand since)? Then say so instead of offering to save.
  const onProject = !!projectTol && Object.keys(tolFound).length > 0 &&
    Object.entries(tolFound).every(([k, t]) => projectTol[k] && fmtTol(projectTol[k]) === fmtTol(t));
  const [tolMsg, setTolMsg] = useState(saved || onProject ? "Saved to the Rules / Tol. tab ✓" : "");
  // What the spec says vs what the project has now, for each category that differs.
  const changed = projectTol ? TOLERANCE_CATS.filter((c) => tolFound[c.key] && (!projectTol[c.key] || fmtTol(projectTol[c.key]) !== fmtTol(tolFound[c.key])))
    .map((c) => `${c.full} now ${projectTol[c.key] ? fmtTol(projectTol[c.key]) : "default"}, spec ${fmtTol(tolFound[c.key])}`) : [];
  const tol = normalizeTolerances(a.tolerances);   // also reads answers saved before tolerances had + and −
  const tolText = TOLERANCE_CATS.filter((c) => tol[c.key]).map((c) => `${c.full} ${fmtTol(tol[c.key])}`).join(" · ");
  async function fillTolerances() {
    setTolMsg("Saving…");
    const r = await fetch("/api/tolerances", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, values: tol, from: { kind: "spec", note: specNote(a.sources) } }) });
    const data = await r.json().catch(() => ({}));
    setTolMsg(r.ok ? "Saved to the Rules / Tol. tab ✓" : data.error || "Couldn't save");
    if (r.ok) router.refresh();
  }
  return (
    <div className="docs-answer">
      {onClose && <button type="button" className="ai-close" onClick={onClose} title="Delete this conversation" aria-label="Delete conversation">✕</button>}
      <div className={`docs-answer-text${a.found ? "" : " notfound"}`}>{a.answer}</div>
      {tolText && (
        <div className="docs-tol">
          <div className="docs-tol-title">Tolerances found in the spec</div>
          <div className="docs-tol-grid">
            {TOLERANCE_GROUPS.filter((g) => g.items.some((i) => tol[i.key])).map((g) => (
              <table key={g.key} className="docs-tol-table">
                <thead><tr><th colSpan={projectTol && changed.length ? 3 : 2}>{g.label}</th></tr></thead>
                <tbody>{g.items.filter((i) => tol[i.key]).map((i) => {
                  const now = projectTol?.[i.key];
                  const differs = !!projectTol && (!now || fmtTol(now) !== fmtTol(tol[i.key]));
                  return (
                    <tr key={i.key} className={differs && !tolMsg ? "differs" : ""}>
                      <td>{i.label}</td><td className="v">{fmtTol(tol[i.key])}</td>
                      {projectTol && changed.length > 0 && <td className="now">{differs && !tolMsg ? `now ${now ? fmtTol(now) : "default"}` : ""}</td>}
                    </tr>
                  );
                })}</tbody>
              </table>
            ))}
          </div>
          <div className="docs-tol-actions">
            {tolMsg ? <span className={tolMsg.includes("✓") ? "pill ok" : "muted"}>{tolMsg}</span> : (
              <>
                {changed.length > 0 && <span className="docs-tol-diff">{changed.length} value{changed.length === 1 ? "" : "s"} differ from the project&apos;s current tolerances (marked).</span>}
                <button className="primary" onClick={fillTolerances}>Use the spec&apos;s tolerances</button>
              </>
            )}
          </div>
        </div>
      )}
      <AnswerTable t={a.table} />
      <Sources list={a.sources} />
      {(a.replies ?? []).map((r) => (
        <div key={r.at} className="docs-turn">
          <div className="docs-turn-q"><span className="muted">{r.by}, {when(r.at)}:</span> {r.question}</div>
          <div className={`docs-answer-text${r.found ? "" : " notfound"}`}>{r.answer}</div>
          <AnswerTable t={r.table} />
          <Sources list={r.sources} />
        </div>
      ))}
      {onReply && (
        <div className="docs-reply">
          <textarea className="ai-input" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} disabled={!!busy}
            placeholder="Reply: answer its question or ask a follow-up (e.g. now just the ones on level 2)" />
          <button className="primary ai-btn" disabled={!!busy || !reply.trim()}
            onClick={async () => { if (await onReply(reply.trim())) setReply(""); }}>{busy ? "Working…" : "Reply"}</button>
        </div>
      )}
    </div>
  );
}

/** Ask questions about the project's Dropbox documents; answers cite the file and page. */
export default function DocsAsk({ project, units, projectTol }: { project: string; units: string[];
  projectTol?: Record<string, { plus: string; minus: string }> }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [question, setQuestion] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [step, setStep] = useState("");                      // what the AI is doing right now
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const unitBox = useRef<HTMLInputElement>(null);
  const [needUnit, setNeedUnit] = useState("");             // a Design values pick waiting for a unit: the box lights up
  const [report, setReport] = useState<ToleranceReport | LeftReport | DesignReport | null>(null);   // Out of tolerance / What's left
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

  /** Ask (or reply): the answer streams back with what the AI is doing ("Reading BuildingStart values…"). */
  async function askStream(body: Record<string, unknown>, label: string): Promise<{ entry: Answer; tolerancesSaved?: boolean } | null> {
    setBusy(label); setStep("Thinking…"); setError("");
    try {
      const r = await fetch("/api/docs", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, action: "ask", ...body }) });
      if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); setError(d.error || "That didn't work. Try again."); return null; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.step) setStep(msg.step);
          if (msg.error) { setError(msg.error); return null; }
          if (msg.entry) return { entry: msg.entry, tolerancesSaved: msg.tolerancesSaved };
        }
      }
      setError("The answer didn't finish (the connection closed). Try again.");
      return null;
    } catch {
      setError("Could not reach the website. Check your connection.");
      return null;
    } finally {
      setBusy(""); setStep("");
    }
  }

  async function ask(mode: string) {
    setAnswer(null); setReport(null);
    const data = await askStream({ mode, question, unit }, mode);
    if (data) { setAnswer(data.entry); setAnswerSaved(!!data.tolerancesSaved); load(); if (data.tolerancesSaved) router.refresh(); }
  }

  /** A reply in a thread: the thread comes back with the new answer added. */
  async function replyTo(entry: Answer, text: string): Promise<boolean> {
    setReport(null);
    const data = await askStream({ mode: "ask", question: text, replyTo: entry.at }, "reply");
    if (!data) return false;
    setAnswer(data.entry); setAnswerSaved(false); load();
    return true;
  }

  /** A pick from the Suggestions list. */
  async function suggest(v: string) {
    if (!v) return;
    const forUnit = v === "design_bs" || v.startsWith("dv_");
    if (forUnit && !unit.trim()) { setError(""); setNeedUnit(v); unitBox.current?.focus(); return; }
    setNeedUnit("");
    if (v === "tolerance" || v === "left" || v === "design_bs") {
      setAnswer(null); setReport(null);
      const data = await post({ action: "report", mode: v === "design_bs" ? "design" : v, unit }, v);
      if (data?.report) setReport(data.report);
      return;
    }
    ask(v);
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
            Answers come from this project&apos;s Dropbox folder (specs, submittals, drawings, ASIs/RFIs, change
            orders, deficiency reports) and its BuildingStart data from the last sync, with the source for each value.
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
          <select className="docs-suggest" value="" disabled={!!busy || !info} onChange={(e) => suggest(e.target.value)}
            aria-label="Suggestions">
            <option value="">{busy && busy !== "ask" && busy !== "remove" && busy !== "update" && busy !== "folder" ? "Working…" : "Suggestions"}</option>
            <option value="tolerances" disabled={!ready}>✨ Tolerances (from the spec)</option>
            <option value="tab" disabled={!ready}>✨ TAB requirements</option>
            <optgroup label="Design values (unit in the box)">
              <option value="design_bs" disabled={!bs || bs.units === 0}>BuildingStart</option>
              <option value="dv_drawings" disabled={!ready}>✨ Drawings (schedules)</option>
              <option value="dv_submittals" disabled={!ready}>✨ Submittals</option>
              <option value="dv_compare" disabled={!canAsk}>✨ Compare all</option>
            </optgroup>
            <optgroup label="From the last sync">
            <option value="tolerance" disabled={!bs || bs.units === 0}>Out of tolerance</option>
            <option value="left">What&apos;s left to do</option>
            </optgroup>
          </select>
          <span className="docs-design">
            <input ref={unitBox} list="docs-units" value={unit} className={needUnit ? "need-unit" : undefined}
              onChange={(e) => setUnit(e.target.value)} onBlur={() => { if (!unit.trim()) setNeedUnit(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && needUnit && unit.trim()) { e.preventDefault(); suggest(needUnit); } }}
              placeholder={needUnit ? "Type or pick the unit, then press Enter for its design values" : "Unit (used by Ask and Design values)"} />
            <datalist id="docs-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
          </span>
        </div>
        <textarea className="ai-input" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything, e.g. Does the design CFM entered for AHU-16 match the submittal? How many VAVs are left on floor 3? Which pumps still need amps?" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary ai-btn" disabled={!canAsk || !!busy || !question.trim()} onClick={() => ask("ask")}>
            {busy === "ask" ? "Working…" : "Ask"}
          </button>
          {!canAsk && info && !working && <span className="muted" style={{ fontSize: 13 }}>Press Find documents to read this project&apos;s files first.</span>}
          {step && busy !== "reply" && <span className="docs-step">⏳ {step}</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </div>

      {report && <ReportView report={report} project={project} onClose={() => setReport(null)} />}

      {shown && !report && (
        <>
          <div className="docs-latest muted">
            {answer ? "Answer" : "Latest question"} · {shown.by}, {when(shown.at)}
            {!answer && <> · <b>{shown.question.split("\n")[0]}</b></>}
          </div>
          <AnswerView key={shown.at} a={shown} project={project} saved={!!answer && answerSaved} projectTol={projectTol} onClose={() => removeAnswer(shown.at)}
            onReply={(t) => replyTo(shown, t)} busy={busy === "reply" ? step || "Working…" : busy ? "busy" : ""} />
          {busy === "reply" && step && <div className="docs-step">⏳ {step}</div>}
        </>
      )}

      {older.length > 0 && (
        <details className="docs-history">
          <summary>Asked before ({older.length})</summary>
          {older.map((h) => (
            <details key={h.at} className="docs-hist-item">
              <summary>{h.question.split("\n")[0]} <span className="muted">· {h.by}, {when(h.at)}{h.replies?.length ? ` · ${h.replies.length} repl${h.replies.length === 1 ? "y" : "ies"}` : ""}</span></summary>
              <AnswerView a={h} project={project} projectTol={projectTol} onClose={() => removeAnswer(h.at)} onReply={(t) => replyTo(h, t)} busy={busy ? "busy" : ""} />
            </details>
          ))}
        </details>
      )}
    </div>
  );
}
