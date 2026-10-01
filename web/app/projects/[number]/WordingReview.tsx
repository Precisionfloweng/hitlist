"use client";
import { useEffect, useMemo, useState } from "react";
import type { Kind, ReviewItem } from "@/lib/reviewItems";
import type { Review, WordingFile } from "@/lib/wording";

type State = "flag" | "blank" | "good" | "updated" | "kept" | "new" | "changed";
const BLANK = "___";
const SHOW_GOOD = 4;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
/** Does the new BuildingStart text match the suggestion (any ___ in it filled with anything)? */
function matches(text: string, suggestion: string): boolean {
  if (!suggestion) return false;
  const parts = norm(suggestion).split(BLANK).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".+?")}$`).test(norm(text));
}

function stateOf(d: ReviewItem, r: Review | undefined): State {
  if (!r) return "new";
  if (r.text === d.text) return r.ok ? "good" : r.kept ? "kept" : "flag";
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

const draftKey = (project: string, kind: Kind, d: ReviewItem) => `hl-wording:${kind}:${project}:${d.key}:${d.text.length}`;

/** "Review wording" for a project's open deficiencies or its notes (same layout, different words). */
export default function WordingReview({ project, kind, items, initial, canReview }:
  { project: string; kind: Kind; items: ReviewItem[]; initial: WordingFile; canReview: boolean }) {
  const notes = kind === "notes";
  const noun = (n: number) => (notes ? `note${n === 1 ? "" : "s"}` : `deficienc${n === 1 ? "y" : "ies"}`);
  const [file, setFile] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const [allGood, setAllGood] = useState(false);

  const open = useMemo(() => items.filter((d) => d.text.trim()), [items]);
  const rows = useMemo(() => open.map((d) => ({ d, r: file.items[d.key], s: stateOf(d, file.items[d.key]) })), [open, file]);
  const flagged = rows.filter((x) => x.s === "flag" || x.s === "blank");
  const rank = (s: State) => (s === "updated" ? 0 : s === "kept" ? 1 : 2);
  const good = rows.filter((x) => x.s === "good" || x.s === "updated" || x.s === "kept")
    .sort((a, b) => rank(a.s) - rank(b.s));
  const pending = rows.filter((x) => x.s === "new" || x.s === "changed");

  // Edits a tech made in a Suggested box are kept on this device until the wording changes in BuildingStart.
  useEffect(() => {
    const out: Record<string, string> = {};
    try {
      for (const { d } of rows) {
        const v = localStorage.getItem(draftKey(project, kind, d));
        if (v !== null) out[d.key] = v;
      }
    } catch { /* storage unavailable */ }
    setDrafts(out);
  }, [project, kind, rows]);
  const setDraft = (d: ReviewItem, v: string) => {
    setDrafts((x) => ({ ...x, [d.key]: v }));
    try { localStorage.setItem(draftKey(project, kind, d), v); } catch { /* storage unavailable */ }
  };

  async function review(all = false) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/wording", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, kind, all }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) setError(data.error || "The wording review failed. Try again.");
      else setFile(data.wording);
    } catch {
      setError("Could not reach the website. Check your connection.");
    }
    setBusy(false);
  }

  async function keep(d: ReviewItem, undo = false) {
    setError("");
    try {
      const r = await fetch("/api/wording", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, kind, keep: d.key, undo }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) setError(data.error || "Couldn't save that. Try again.");
      else setFile(data.wording);
    } catch {
      setError("Could not reach the website. Check your connection.");
    }
  }

  if (open.length === 0) return null;
  const when = file.reviewedAt ? new Date(file.reviewedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
  const never = !file.reviewedAt;

  return (
    <section className="wording">
      <div className="wording-bar">
        {canReview && (
          <button className="primary" disabled={busy} onClick={() => {
            // Nothing new to check: offer to review every open item again (e.g. after a late BuildingStart sync).
            if (!never && pending.length === 0) {
              if (confirm(`Every ${notes ? "note" : "open item"} has already been reviewed. Review them all again?`)) review(true);
            } else review();
          }}>
            {busy ? "Reviewing…" : !never && pending.length === 0 ? "✎ Review all again" : "✎ Review wording"}
          </button>
        )}
        <span className="muted">
          {never ? `Claude checks each ${notes ? "note" : "open deficiency"} and suggests clearer wording where it helps.`
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
          <span>{pending.length} {noun(pending.length)} {pending.length === 1 ? "was" : "were"} added or changed since the last review.</span>
          <span style={{ flex: 1 }} />
          {canReview && <button className="primary small" disabled={busy} onClick={() => review()}>{busy ? "Reviewing…" : "Review new items"}</button>}
        </div>
      )}

      {flagged.map(({ d, r, s }) => {
        const value = drafts[d.key] ?? (s === "blank" ? d.text : r!.suggestion);
        return (
          <div key={d.key} className="witem">
            <div className="witem-head">
              {d.label && <b>{d.label}</b>} <b>{d.equipment}</b>
              {d.priority && <span className={`pill ${d.priority === "High" ? "bad" : d.priority === "Medium" ? "warn" : "gray"}`}>{d.priority}</span>}
              <span className="muted">{notes ? d.itemType : d.role}</span>
              {s === "blank" && <span className="pill warn">Updated, blank left in</span>}
            </div>
            <div className="wlab">Current</div>
            <div className="wrow">
              <div className="worig">{d.text}</div>
              {canReview && s === "flag" && (
                <button title="Keep the current wording and stop suggesting a change" onClick={() => keep(d)}>Keep as is</button>
              )}
            </div>
            <div className="wlab">Suggested</div>
            <div className="wrow">
              <textarea rows={2} value={value} onChange={(e) => setDraft(d, e.target.value)} />
              <button className={copied === d.key ? "wcopied" : "primary"}
                onClick={async () => { await copyText(value); setCopied(d.key); setTimeout(() => setCopied((c) => (c === d.key ? "" : c)), 2000); }}>
                {copied === d.key ? "Copied ✓" : "Copy"}
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
            <div key={d.key} className="wline wline-new">
              <span className="pill wpill-new-soft">{s === "changed" ? "Changed" : "New"}</span>
              {d.label && <b>{d.label}</b>} {d.equipment} <span className="muted wline-text">· {d.text}</span>
            </div>
          ))}
        </>
      )}

      {!never && good.length > 0 && (
        <>
          <div className="wlab" style={{ marginTop: 14 }}>Reads well</div>
          {(allGood ? good : good.slice(0, SHOW_GOOD)).map(({ d, s }) => (
            <div key={d.key} className="wline">
              <span className="pill ok">✓</span>
              {s === "updated" && <span className="pill wpill-upd">Updated</span>}
              {s === "kept" && <span className="pill gray" title={`Kept by ${file.items[d.key]?.kept?.by ?? ""}`}>Kept as is</span>}
              {d.label && <b>{d.label}</b>} {d.equipment} <span className="muted wline-text">· {d.text}</span>
              {s === "kept" && canReview && <button className="linkish" onClick={() => keep(d, true)}>Undo</button>}
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
