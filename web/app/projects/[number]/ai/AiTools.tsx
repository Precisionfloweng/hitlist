"use client";
import { useMemo, useState } from "react";

type Unit = { path: string; name: string; type: string };
const BLANK = "___";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
  }
}

/** Type, paste or dictate a deficiency or note; Claude refines it with this project's context. */
export default function AiTools({ project, units }: { project: string; units: Unit[] }) {
  const [kind, setKind] = useState<"deficiencies" | "notes">("deficiencies");
  const [unitText, setUnitText] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ suggestion: string; why: string; other: string } | null>(null);
  const [out, setOut] = useState("");
  const [copied, setCopied] = useState(false);

  const label = (u: Unit) => `${u.name} · ${u.type}`;
  const byLabel = useMemo(() => new Map(units.map((u) => [label(u), u])), [units]);
  const unit = byLabel.get(unitText) ?? null;

  async function refine() {
    setBusy(true); setError(""); setCopied(false);
    try {
      const r = await fetch("/api/ai-tools", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, kind, text, unitPath: unit?.path }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) setError(data.error || "Couldn't refine that. Try again.");
      else { setResult(data); setOut(data.suggestion); }
    } catch {
      setError("Could not reach the website. Check your connection.");
    }
    setBusy(false);
  }

  return (
    <section className="ai-tools">
      <div className="card ai-card">
        <div className="ai-head">
          <span className="ai-spark" aria-hidden>✨</span>
          <div>
            <b>Refine a {kind === "notes" ? "note" : "deficiency"}</b>
            <div className="muted" style={{ fontSize: 13 }}>
              Type, paste or dictate it, rough is fine. Claude rewrites it the PFE way, ready to paste into BuildingStart.
            </div>
          </div>
        </div>

        <div className="ai-row">
          <div className="seg" role="group" aria-label="What is it?">
            <button className={kind === "deficiencies" ? "on" : ""} onClick={() => setKind("deficiencies")}>Deficiency</button>
            <button className={kind === "notes" ? "on" : ""} onClick={() => setKind("notes")}>Note</button>
          </div>
          <input className="ai-unit" list="ai-units" value={unitText} onChange={(e) => setUnitText(e.target.value)}
            placeholder={units.length ? "Equipment (optional): start typing a unit" : "Equipment (sync the project to pick a unit)"} />
          <datalist id="ai-units">{units.map((u) => <option key={u.path} value={label(u)} />)}</datalist>
        </div>
        {unitText && !unit && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Pick a unit from the list, or clear the box.</div>}

        <textarea className="ai-input" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={kind === "notes" ? "e.g. OA damper locked at 35 pct for test, flow station wont calibrate in wind"
            : "e.g. fans only hitting 20 percent cant get design flow"} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary ai-btn" disabled={busy || !text.trim() || (!!unitText && !unit)} onClick={refine}>
            {busy ? "Refining…" : "✨ Refine"}
          </button>
          <span className="muted" style={{ fontSize: 13 }}>Tap 🎤 on the iPad keyboard to talk (Windows key + H on a PC).</span>
          {error && <span className="error">{error}</span>}
        </div>
      </div>

      {result && (
        <div className="card ai-card ai-result">
          <button type="button" className="ai-close" onClick={() => { setResult(null); setOut(""); }} title="Close" aria-label="Close">✕</button>
          <div className="wlab">Refined</div>
          <div className="wrow">
            <textarea rows={3} value={out} onChange={(e) => setOut(e.target.value)} />
            <button className={copied ? "wcopied" : "primary"}
              onClick={async () => { await copyText(out); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="wwhy">
            {result.why}{out.includes(BLANK) && <> Fill in the <span className="wblank">{BLANK}</span> before copying.</>}
            {result.other && <> <span className="wflag">{result.other}</span></>}
          </div>
        </div>
      )}
    </section>
  );
}
