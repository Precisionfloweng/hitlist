"use client";
import { useMemo, useState } from "react";
import type { TypeResult } from "@/lib/results";

const SYMBOL: Record<string, string> = { P: "✓", R: "✖", O: "⚠", "-": "" };

export default function EquipmentGrid({ types }: { types: TypeResult[] }) {
  const [key, setKey] = useState(types[0]?.key);
  const [missingOnly, setMissingOnly] = useState(true);
  const [q, setQ] = useState("");
  const t = types.find((x) => x.key === key) ?? types[0];

  const cols = useMemo(() => {
    if (!t) return [];
    // Hide fields that don't apply to any unit.
    return t.fields.map((f, i) => ({ ...f, i })).filter((f) => t.units.some((u) => u.codes[f.i] !== "-"));
  }, [t]);
  const units = useMemo(() => {
    if (!t) return [];
    const s = q.trim().toLowerCase();
    return t.units.filter((u) => (!missingOnly || u.required_filled < u.required) &&
      (!s || u.name.toLowerCase().includes(s) || (u.area || "").toLowerCase().includes(s)));
  }, [t, missingOnly, q]);
  if (!t) return null;

  return (
    <div>
      <div className="tabs">
        {types.map((x) => (
          <button key={x.key} className={x.key === t.key ? "on" : ""} onClick={() => setKey(x.key)}>
            {x.name} <span className="muted" style={{ color: "inherit", opacity: .75 }}>{Math.round(x.summary.fields_pct)}%</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="Find a unit or area" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} /> Only units with missing required data
        </label>
        <span className="muted">{units.length} of {t.units.length} units · ✓ filled · <span className="s-R">✖</span> required missing · <span className="s-O">⚠</span> optional missing</span>
      </div>
      <div className="scroll">
        <table className="grid">
          <thead><tr>
            <th className="sticky">Unit</th><th>Area</th><th className="num">Done</th>
            {cols.map((c) => <th key={c.i} className="c" title={`${c.label} (${c.status})`}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.path || u.name}>
                <td className="sticky" title={u.path}>{u.name}</td>
                <td className="muted">{u.area}</td>
                <td className="num">{u.required_filled}/{u.required}</td>
                {cols.map((c) => { const code = u.codes[c.i] ?? "-";
                  return <td key={c.i} className={`c s-${code}`} title={c.label}>{SYMBOL[code]}</td>; })}
              </tr>
            ))}
            {units.length === 0 && <tr><td colSpan={cols.length + 3} className="muted">Nothing missing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
