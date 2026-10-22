"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, categoryPcts, completePct, type TypeTotals, type Weights } from "@/lib/completion";

/** Each equipment category's share of the job, a total that must be 100%, and a before/after preview on one project. */
export default function WeightsEditor({ initial, projects }: { initial: Weights; projects: { id: string; label: string }[] }) {
  const router = useRouter();
  const str = (w: Weights) => Object.fromEntries(CATEGORIES.map((c) => [c.key, String(w[c.key] ?? c.default)]));
  const [saved, setSaved] = useState<Weights>(initial);
  const [boxes, setBoxes] = useState<Record<string, string>>(str(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [project, setProject] = useState(projects[0]?.id ?? "");
  const [totals, setTotals] = useState<TypeTotals | null>(null);
  const nums: Weights = Object.fromEntries(CATEGORIES.map((c) => [c.key, Number(boxes[c.key]) || 0]));
  const total = Math.round(10 * Object.values(nums).reduce((a, b) => a + b, 0)) / 10;
  const dirty = CATEGORIES.some((c) => Number(boxes[c.key]) !== saved[c.key] || boxes[c.key].trim() === "");
  const valid = CATEGORIES.every((c) => boxes[c.key].trim() !== "" && Number(boxes[c.key]) >= 0 && Number(boxes[c.key]) <= 100) && total === 100;

  useEffect(() => {
    if (!project) return;
    setTotals(null);
    fetch(`/api/admin/weights?project=${encodeURIComponent(project)}`).then((r) => r.json()).then((d) => setTotals(d.totals ?? []));
  }, [project]);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/weights", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ weights: boxes }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ text: data.error || "Save failed", ok: false }); return; }
    setSaved(data.weights); setBoxes(str(data.weights));
    setMsg({ text: `Saved · ${data.updated} project${data.updated === 1 ? "" : "s"} recalculated`, ok: true });
    router.refresh();
  }

  const pcts = totals ? categoryPcts(totals) : {};
  const fmt = (n: number) => `${Math.round(n)}%`;
  return (
    <div className="card tol-card">
      <div className="card-head">
        <b>Completion weights</b>
        <span className="muted" style={{ fontSize: 13 }}>How much of the job each equipment category is. A project&apos;s overall % complete
          (Projects list, Overview, Monday email) = each category&apos;s own % filled in × its share. A category a job doesn&apos;t have
          is left out and its share is spread over the rest, so every job can reach 100%. The shares must add up to 100%.</span>
      </div>
      <table className="weights-table">
        <thead><tr><th>Category</th><th>Share of job</th><th>Includes</th>{totals && <th>Preview job</th>}</tr></thead>
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c.key}>
              <td><b>{c.label}</b></td>
              <td><span className="tol-input"><input inputMode="decimal" aria-label={`${c.label} share percent`} value={boxes[c.key]}
                onChange={(e) => setBoxes({ ...boxes, [c.key]: e.target.value.replace(/[^\d.]/g, "") })} />%</span></td>
              <td className="muted" style={{ fontSize: 13 }}>{c.includes}</td>
              {totals && <td className="muted">{c.key in pcts ? fmt(pcts[c.key]) + " done" : "not on this job"}</td>}
            </tr>
          ))}
          <tr className="weights-total"><td><b>Total</b></td><td><b className={total === 100 ? "ok-text" : "error"}>{total}%</b></td>
            <td className="muted" style={{ fontSize: 13 }}>{total === 100 ? "" : "must be 100%"}</td>{totals && <td />}</tr>
        </tbody>
      </table>
      {projects.length > 0 && (
        <div className="row" style={{ marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted">Preview on</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {totals && totals.length > 0 && (
            <span>Overall complete: <b>{completePct(totals, saved)}%</b> now → <b>{valid ? `${completePct(totals, nums)}%` : "–"}</b> with these shares</span>
          )}
          {totals && !totals.length && <span className="muted">No sync results for this project yet.</span>}
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={busy || !valid} title={dirty ? undefined : "Save again to recalculate every project now"} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {msg && <span className={msg.ok ? "pill ok" : "error"}>{msg.text}</span>}
      </div>
    </div>
  );
}
