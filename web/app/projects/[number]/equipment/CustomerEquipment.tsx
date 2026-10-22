"use client";
import { useMemo, useState } from "react";
import { categoriesFor, fmtTol, hasTol, TOLERANCE_CATS, type Tolerances } from "@/lib/toleranceCats";
import { STATUS_LABEL, type CustType } from "@/lib/customerView";

/** The customer's checklist: each main unit Done / In progress / Not started, and any open punch items. */
export default function CustomerEquipment({ types, initialType, syncedAt, tolerances = {} }:
  { types: CustType[]; initialType?: string; syncedAt?: string; tolerances?: Tolerances }) {
  const [key, setKey] = useState(() => types.find((t) => t.key === initialType)?.key ?? types[0]?.key);
  const [notDone, setNotDone] = useState(false);
  const [q, setQ] = useState("");
  const t = types.find((x) => x.key === key) ?? types[0];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (t?.units ?? []).filter((u) => (!notDone || u.status !== "done")
      && (!s || u.name.toLowerCase().includes(s) || u.location.toLowerCase().includes(s)));
  }, [t, q, notDone]);
  if (!t) return <div className="card">No equipment yet.</div>;
  const tolKeys = [...new Set([...categoriesFor(t.export_sheet), ...categoriesFor(t.key)])].filter((k) => hasTol(tolerances[k]));

  return (
    <div className="cust-eq">
      <nav className="eq-types" aria-label="Equipment types">
        <select className="eq-select" value={t.key} onChange={(e) => setKey(e.target.value)}>
          {types.map((x) => <option key={x.key} value={x.key}>{x.name} ({x.done} of {x.units.length} done)</option>)}
        </select>
        <ul>
          {types.map((x) => {
            const pct = Math.round(100 * x.done / x.units.length);
            return (
              <li key={x.key}>
                <button className={`${x.key === t.key ? "on" : ""}${x.done === x.units.length ? " full" : ""}`} onClick={() => setKey(x.key)}>
                  <span className="eq-name">{x.name}</span>
                  <span className="eq-pct">{pct}%</span>
                  <span className="bar"><span style={{ width: `${pct}%` }} /></span>
                  <span className="eq-sub">{x.done === x.units.length ? `✓ All ${x.units.length} done` : `${x.done} of ${x.units.length} done`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="card cust-eq-card">
        <h2 style={{ margin: 0 }}>{t.name}</h2>
        <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>
          {t.done} of {t.units.length} done
          {syncedAt && <> · last updated {new Date(syncedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</>}
        </div>
        {tolKeys.length > 0 && (
          <div className="eq-tol"><b>Tolerance</b>{" "}
            {tolKeys.map((k) => { const c = TOLERANCE_CATS.find((x) => x.key === k)!;
              return <span key={k} className="eq-tol-item">
                {tolKeys.length > 1 || c.group === "ahu" || c.group === "terminal" ? `${c.label} ` : ""}{fmtTol(tolerances[k])}</span>; })}
          </div>
        )}
        <div className="eq-tools" style={{ marginTop: 12 }}>
          <div className="seg" role="group">
            <button className={!notDone ? "on" : ""} onClick={() => setNotDone(false)}>All ({t.units.length})</button>
            <button className={notDone ? "on" : ""} onClick={() => setNotDone(true)}>Not done ({t.units.length - t.done})</button>
          </div>
          <input type="search" placeholder="Find a unit or area" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <table className="cust-table">
          <thead><tr><th>Unit</th><th>Location</th><th>Status</th><th>Punch list</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.path || u.name}>
                <td><b>{u.name}</b></td>
                <td className="muted">{u.location}</td>
                <td><span className={`cust-st ${u.status}`}>{u.status === "done" ? "✓ " : ""}{STATUS_LABEL[u.status]}</span></td>
                <td>{u.punch ? <span className="pill bad">{u.punch} open item{u.punch === 1 ? "" : "s"}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="muted">{q ? "No units match your search." : "Every unit is done. ✓"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
