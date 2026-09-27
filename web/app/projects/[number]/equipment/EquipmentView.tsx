"use client";
import { useMemo, useState } from "react";
import type { TypeResult } from "@/lib/results";

type Filter = "missing" | "all";
const STATUS_WORD: Record<string, string> = { P: "filled", R: "required, missing", O: "optional, missing", "-": "not applicable" };

function Cell({ code, label }: { code: string; label: string }) {
  const tip = `${label}: ${STATUS_WORD[code] ?? ""}`;
  if (code === "P") return <td className="ck p" title={tip}>✓</td>;
  if (code === "R") return <td className="ck r" title={tip}><span>✕</span></td>;
  if (code === "O") return <td className="ck o" title={tip}>!</td>;
  return <td className="ck na" title={tip}>·</td>;
}

export default function EquipmentView({ types, initialType, syncedAt }:
  { types: TypeResult[]; initialType?: string; syncedAt?: string }) {
  const sorted = useMemo(() => [...types].sort((a, b) => a.name.localeCompare(b.name)), [types]);
  const [key, setKey] = useState(() => sorted.find((t) => t.key === initialType)?.key ?? sorted[0]?.key);
  const [filter, setFilter] = useState<Filter>("missing");
  const [q, setQ] = useState("");
  const t = sorted.find((x) => x.key === key) ?? sorted[0];

  function pick(k: string) {
    setKey(k);
    setQ("");
    const url = new URL(window.location.href);
    url.searchParams.set("type", k);
    window.history.replaceState(null, "", url);
  }

  const incomplete = t ? t.units.filter((u) => u.required_filled < u.required).length : 0;
  const units = useMemo(() => {
    if (!t) return [];
    const s = q.trim().toLowerCase();
    return t.units
      .filter((u) => filter === "all" || u.required_filled < u.required)
      .filter((u) => !s || u.name.toLowerCase().includes(s) || (u.area || "").toLowerCase().includes(s));
  }, [t, filter, q]);
  // Only show fields that apply to at least one of the units on screen.
  const cols = useMemo(() => {
    if (!t) return [];
    const shown = units.length ? units : t.units;
    return t.fields.map((f, i) => ({ ...f, i })).filter((f) => shown.some((u) => (u.codes[f.i] ?? "-") !== "-"));
  }, [t, units]);
  if (!t) return <div className="card">No equipment in this export.</div>;

  const missingReq = t.summary.missing_required;

  return (
    <div className="eq">
      <nav className="eq-types" aria-label="Equipment types">
        <select className="eq-select" value={t.key} onChange={(e) => pick(e.target.value)}>
          {sorted.map((x) => <option key={x.key} value={x.key}>{x.name} ({Math.round(x.summary.fields_pct)}%)</option>)}
        </select>
        <ul>
          {sorted.map((x) => {
            const open = x.units.filter((u) => u.required_filled < u.required).length;
            return (
              <li key={x.key}>
                <button className={x.key === t.key ? "on" : ""} onClick={() => pick(x.key)}>
                  <span className="eq-name">{x.name}</span>
                  <span className="eq-pct">{Math.round(x.summary.fields_pct)}%</span>
                  <span className="bar"><span style={{ width: `${x.summary.fields_pct}%` }} /></span>
                  <span className="eq-sub">{open ? `${open} of ${x.units.length} units need data` : `All ${x.units.length} units complete`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="eq-main">
        <div className="eq-head">
          <div>
            <h2>{t.name}</h2>
            <div className="muted">
              {t.summary.units_complete} of {t.summary.units} units complete · {missingReq} required field{missingReq === 1 ? "" : "s"} missing
              {syncedAt && <> · synced {new Date(syncedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</>}
            </div>
          </div>
        </div>

        <div className="eq-tools">
          <input type="search" placeholder="Find a unit or area" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg" role="group">
            <button className={filter === "missing" ? "on" : ""} onClick={() => setFilter("missing")}>Needs data ({incomplete})</button>
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All units ({t.units.length})</button>
          </div>
          <div className="legend">
            <span><span className="ck-key p">✓</span>Filled</span>
            <span><span className="ck-key r"><span>✕</span></span>Required missing</span>
            <span><span className="ck-key o">!</span>Optional missing</span>
            <span><span className="ck-key na">·</span>Doesn&apos;t apply</span>
          </div>
        </div>

        <div className="eq-scroll">
          <table className="eq-grid">
            <thead>
              <tr>
                <th className="u">Unit</th>
                <th className="d">Done</th>
                {cols.map((c, n) => (
                  <th key={c.i} className={`f ${c.status === "optional" ? "opt" : ""}`} title={`${c.label} (${c.status})`}
                    style={{ zIndex: 2 + cols.length - n }}>
                    <span>{c.label}</span>
                  </th>
                ))}
                <th className="pad" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const done = u.required ? u.required_filled / u.required : 1;
                return (
                  <tr key={u.path || u.name}>
                    <td className="u" title={u.path}>
                      <div className="u-name">{u.name}</div>
                      {u.area && <div className="u-area">{u.area}</div>}
                    </td>
                    <td className="d">
                      <div className="d-num">{u.required_filled}/{u.required}</div>
                      <div className={`d-bar ${done >= 1 ? "full" : ""}`}><span style={{ width: `${done * 100}%` }} /></div>
                    </td>
                    {cols.map((c) => <Cell key={c.i} code={u.codes[c.i] ?? "-"} label={c.label} />)}
                    <td className="pad" />
                  </tr>
                );
              })}
              {units.length === 0 && (
                <tr><td colSpan={cols.length + 3} className="eq-empty">
                  {q ? "No units match your search." : "Every unit has all its required data. ✓"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted eq-foot">Optional fields have grey headings. Hover or tap and hold a mark to see the field name.</p>
      </section>
    </div>
  );
}
