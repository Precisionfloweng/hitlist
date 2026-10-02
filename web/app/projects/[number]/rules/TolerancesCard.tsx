"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TOLERANCE_CATS, type ToleranceKey, type Tolerances } from "@/lib/toleranceCats";

/** The project's tolerances (±%), typed in by a tech. Blank = not set (not shown anywhere). */
export default function TolerancesCard({ project, initial, canEdit, present }:
  { project: string; initial: Tolerances; canEdit: boolean; present: ToleranceKey[] | null }) {
  // Only the equipment this project has (plus any category that already has a value, so it can be cleared).
  const cats = TOLERANCE_CATS.filter((c) => !present || present.includes(c.key) || initial[c.key]);
  const router = useRouter();
  const [saved, setSaved] = useState<Tolerances>(initial);
  const [vals, setVals] = useState<Tolerances>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const dirty = cats.some((c) => (vals[c.key] ?? "") !== (saved[c.key] ?? ""));

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/tolerances", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, values: Object.fromEntries(cats.map((c) => [c.key, vals[c.key] ?? ""])) }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setSaved(data.tolerances); setVals(data.tolerances);
    setMsg({ text: "Saved", ok: true });
    router.refresh();
  }

  if (cats.length === 0) return null;          // none of this equipment on the project
  return (
    <div className="card tol-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>Tolerances</b>
        <span className="muted" style={{ fontSize: 13 }}>From the project spec, ± percent. Leave blank if not specified.</span>
      </div>
      <div className="tol-grid">
        {cats.map((c) => (
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
