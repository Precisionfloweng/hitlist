"use client";
import { useEffect, useMemo, useState } from "react";
import type { Deficiency } from "@/lib/results";
import type { Review, WordingFile } from "@/lib/wording";

type State = "flag" | "blank" | "good" | "updated" | "new" | "changed";
const BLANK = "___";
const SHOW_GOOD = 4;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
/** Does the new BuildingStart text match the suggestion (any ___ in it filled with anything)? */
function matches(text: string, suggestion: string): boolean {
  if (!suggestion) return false;
  const parts = norm(suggestion).split(BLANK).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".+?")}$`).test(norm(text));
}

function stateOf(d: Deficiency, r: Review | undefined): State {
  if (!r) return "new";
  if (r.text === d.text) return r.ok ? "good" : "flag";
  if (d.text.includes(BLANK)) return "blank";
  if (matches(d.text, r.suggestion)) return "updated";
  return "changed";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {                                   // older browsers: copy through a hidden text box
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
  }
}

const draftKey = (project: string, d: Deficiency) => `hl-wording:${project}:${d.number}:${d.text.length}`;

export default function WordingReview({ project, items, initial, canReview }:
  { project: string; items: Deficiency[]; initial: WordingFile; canReview: boolean }) {
  const [file, setFile] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const [allGood, setAllGood] = useState(false);

  const open = useMemo(() => items.filter((d) => d.open && d.text.trim()), [items]);
  const rows = useMemo(() => open.map((d) => ({ d, r: file.items[d.number], s: stateOf(d, file.items[d.number]) })), [open, file]);
  const flagged = rows.filter((x) => x.s === "flag" || x.s === "blank");
  const good = rows.filter((x) => x.s === "good" || x.s === "updated")
    .sort((a, b) => (a.s === "updated" ? 0 : 1) - (b.s === "updated" ? 0 : 1));
  const pending = rows.filter((x) => x.s === "new" || x.s === "changed");

  // Edits a tech made in a Suggested box are kept on this device until the wording changes in BuildingStart.
  useEffect(() => {
    const out: Record<string, string> = {};
    try {
      for (const { d } of rows) {
        const v = localStorage.getItem(draftKey(project, d));
        if (v !== null) out[d.number] = v;
      }
    } catch { /* storage unavailable */ }
    setDrafts(out);
  }, [project, rows]);
  const setDraft = (d: Deficiency, v: string) => {
    setDrafts((x) => ({ ...x, [d.number]: v }));
    try { localStorage.setItem(draftKey(project, d), v); } catch { /* storage unavailable */ }
  };

  async function review() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/wording", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) setError(data.error || "The wording review failed. Try again.");
      else setFile(data.wording);
    } catch {
      setError("Could not reach the website. Check your connection.");
    }
    setBusy(false);
  }

  if (open.length === 0) return null;
  const when = file.reviewedAt ? new Date(file.reviewedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
  const never = !file.reviewedAt;

  return (
    <section className="wording">
      <div className="wording-bar">
        {canReview && (
          <button className="primary" disabled={busy || (!never && pending.length === 0)} onClick={review}>
            {busy ? "Reviewing…" : "✎ Review wording"}
          </button>
        )}
        <span className="muted">
          {never ? "Claude checks each open deficiency and suggests clearer wording where it helps."
            : <>Last reviewed {when} · {flagged.length > 0
              ? <b style={{ color: "var(--bad)" }}>{flagged.length} item{flagged.length === 1 ? "" : "s"}</b>
              : <b>0 items</b>} could be clearer · {good.length} read well</>}
        </span>
        {busy && <span className="muted">This takes 10–30 seconds.</span>}
        {error && <span className="error">{error}</span>}
      </div>

      {!never && pending.length > 0 && (
        <div className="wording-new">
          <span className="pill wpill-new">{pending.length} new</span>
          <span>{pending.length} deficienc{pending.length === 1 ? "y was" : "ies were"} added or changed since the last review.</span>
          <span style={{ flex: 1 }} />
          {canReview && <button className="primary small" disabled={busy} onClick={review}>{busy ? "Reviewing…" : "Review new items"}</button>}
        </div>
      )}

      {flagged.map(({ d, r, s }) => {
        const value = drafts[d.number] ?? (s === "blank" ? d.text : r!.suggestion);
        return (
          <div key={d.number} className="witem">
            <div className="witem-head">
              <b>#{d.number}</b> <b>{d.equipment}</b>
              <span className={`pill ${d.priority === "High" ? "bad" : d.priority === "Medium" ? "warn" : "gray"}`}>{d.priority}</span>
              <span className="muted">{d.role}</span>
              {s === "blank" && <span className="pill warn">Updated, blank left in</span>}
            </div>
            <div className="wlab">Current</div>
            <div className="worig">{d.text}</div>
            <div className="wlab">Suggested</div>
            <div className="wrow">
              <textarea rows={2} value={value} onChange={(e) => setDraft(d, e.target.value)} />
              <button className={copied === d.number ? "wcopied" : "primary"}
                onClick={async () => { await copyText(value); setCopied(d.number); setTimeout(() => setCopied((c) => (c === d.number ? "" : c)), 2000); }}>
                {copied === d.number ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="wwhy">
              {s === "blank" ? <><span className="wflag">Fill in the {BLANK} blank</span>, then copy and paste it into BuildingStart again.</>
                : <>{r!.why}{value.includes(BLANK) && <> Fill in the <span className="wblank">{BLANK}</span> before copying.</>}</>}
              {r?.other && <> <span className="wflag">{r.other}</span></>}
            </div>
          </div>
        );
      })}

      {!never && pending.length > 0 && (
        <>
          <div className="wlab" style={{ marginTop: 14 }}>Not reviewed yet</div>
          {pending.map(({ d, s }) => (
            <div key={d.number} className="wline wline-new">
              <span className="pill wpill-new-soft">{s === "changed" ? "Changed" : "New"}</span>
              <b>#{d.number}</b> {d.equipment} <span className="muted">· {d.text}</span>
            </div>
          ))}
        </>
      )}

      {!never && good.length > 0 && (
        <>
          <div className="wlab" style={{ marginTop: 14 }}>Reads well</div>
          {(allGood ? good : good.slice(0, SHOW_GOOD)).map(({ d, s }) => (
            <div key={d.number} className="wline">
              <span className="pill ok">✓</span>
              {s === "updated" && <span className="pill wpill-upd">Updated</span>}
              <b>#{d.number}</b> {d.equipment} <span className="muted">· {d.text}</span>
            </div>
          ))}
          {good.length > SHOW_GOOD && (
            <button className="linkish" onClick={() => setAllGood(!allGood)}>
              {allGood ? "Show fewer" : `+ ${good.length - SHOW_GOOD} more that read well`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
