"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TOLERANCE_CATS, type Tolerances } from "@/lib/toleranceCats";

/** The project's tolerances (±%), typed in by a tech. Blank = not set (not shown anywhere). */
export default function TolerancesCard({ project, initial, canEdit }: { project: string; initial: Tolerances; canEdit: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState<Tolerances>(initial);
  const [vals, setVals] = useState<Tolerances>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const dirty = TOLERANCE_CATS.some((c) => (vals[c.key] ?? "") !== (saved[c.key] ?? ""));

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/tolerances", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, values: Object.fromEntries(TOLERANCE_CATS.map((c) => [c.key, vals[c.key] ?? ""])) }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setSaved(data.tolerances); setVals(data.tolerances);
    setMsg({ text: "Saved", ok: true });
    router.refresh();
  }

  return (
    <div className="card tol-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>Tolerances</b>
        <span className="muted" style={{ fontSize: 13 }}>From the project spec, ± percent. Leave blank if not specified.</span>
      </div>
      <div className="tol-grid">
        {TOLERANCE_CATS.map((c) => (
          <label key={c.key} className="tol-box">
            <span>{c.label}</span>
            <span className="tol-input">±<input inputMode="decimal" value={vals[c.key] ?? ""} disabled={!canEdit}
              onChange={(e) => setVals({ ...vals, [c.key]: e.target.value.replace(/[^\d.]/g, "") })} placeholder="–" />%</span>
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save tolerances"}</button>
          {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
